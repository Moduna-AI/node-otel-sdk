import process from "node:process";
import { SpanKind, trace } from "@opentelemetry/api";
import type { AttributeValue } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ModunaOTELConfig } from "../interface/ModunaOTELConfig.js";
import type { TraceCallback } from "../types/TraceCallback.js";
import type { ModunaOTELFramework } from "../types/SupportedSDK.js";
import type {
	ModunaTelemetryMetadata,
	ModunaTraceContext,
} from "../types/TraceContext.js";
import type { ModunaLangChainCallbackHandlerConfig } from "./ModunaLangChainCallbackHandler.js";
import {
	ModunaLangChainCallbackHandler,
	registerGlobalModunaLangChainHandler,
} from "./ModunaLangChainCallbackHandler.js";

const DEFAULT_ENDPOINT =
	"https://volex-otel-git-506013021984.us-central1.run.app/v1/traces";

type OTLPTraceExporterConfig = ConstructorParameters<
	typeof OTLPTraceExporter
>[0];
type OTLPTraceExportArgs = Parameters<OTLPTraceExporter["export"]>;
type OTLPTraceExportResult = Parameters<OTLPTraceExportArgs[1]>[0];

class SilentOTLPTraceExporter extends OTLPTraceExporter {
	private readonly onFailure: (error: unknown) => void;

	/**
	 * Creates an OTLP exporter that reports failures without breaking user code.
	 *
	 * @param config OTLP HTTP exporter configuration.
	 * @param onFailure Callback invoked when export fails.
	 */
	public constructor(
		config: OTLPTraceExporterConfig,
		onFailure: (error: unknown) => void,
	) {
		super(config);
		this.onFailure = onFailure;
	}

	/**
	 * Exports spans and converts synchronous exporter failures into callback results.
	 *
	 * @param spans Readable spans from the OpenTelemetry processor.
	 * @param resultCallback OpenTelemetry export completion callback.
	 */
	public override export(
		spans: OTLPTraceExportArgs[0],
		resultCallback: OTLPTraceExportArgs[1],
	): ReturnType<OTLPTraceExporter["export"]> {
		try {
			return super.export(spans, (result) => {
				if (result.error || result.code !== 0) {
					this.onFailure(
						result.error ??
							new Error(
								`Moduna OTEL exporter failed with code ${result.code}.`,
							),
					);
				}

				resultCallback(result);
			});
		} catch (error) {
			this.onFailure(error);
			resultCallback(this.createFailureResult(error));
		}
	}

	private createFailureResult(error: unknown): OTLPTraceExportResult {
		return {
			code: 1,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

/**
 * Vercel AI SDK compatible telemetry settings.
 */
export interface ModunaVercelTelemetrySettings {
	/**
	 * Enables Vercel AI SDK telemetry for the current model call.
	 */
	isEnabled: true;

	/**
	 * Per-call Moduna metadata attached to the generated OpenTelemetry spans.
	 */
	metadata: ModunaTelemetryMetadata & Record<string, AttributeValue>;
}

interface NormalizedConfig {
	/**
	 * API key used by the Moduna OTLP endpoint.
	 */
	apiKey?: string;

	/**
	 * Service name attached to telemetry resources.
	 */
	agentName: string;

	/**
	 * Framework that will emit telemetry through this SDK.
	 */
	framework: ModunaOTELFramework;

	/**
	 * Extra headers sent to the OTLP endpoint.
	 */
	headers?: Record<string, string>;

	/**
	 * Whether process lifecycle hooks should shut down telemetry automatically.
	 */
	autoShutdown: boolean;
}

interface SharedSDKState {
	/**
	 * Singleton NodeSDK instance used by all ModunaOTEL wrappers.
	 */
	sdk?: NodeSDK;

	/**
	 * Startup promise for the singleton SDK.
	 */
	startPromise?: Promise<void>;

	/**
	 * Shutdown promise for the singleton SDK.
	 */
	shutdownPromise?: Promise<void>;

	/**
	 * Whether Node.js process lifecycle hooks have already been registered.
	 */
	lifecycleHooksRegistered: boolean;

	/**
	 * Whether the singleton SDK has started successfully.
	 */
	started: boolean;

	/**
	 * Whether a warning has already been sent for a telemetry failure.
	 */
	warned: boolean;
}

/**
 * One-line OpenTelemetry setup for Moduna AI traces.
 */
export class ModunaOTEL {
	private static readonly shared: SharedSDKState = {
		lifecycleHooksRegistered: false,
		started: false,
		warned: false,
	};

	private readonly framework: ModunaOTELFramework;

	/**
	 * Creates a Moduna OTEL wrapper and starts telemetry asynchronously.
	 *
	 * @param config SDK configuration for the current application.
	 */
	public constructor(config: ModunaOTELConfig) {
		const normalizedConfig = this.normalizeConfig(config);
		this.framework = normalizedConfig.framework;
		ModunaOTEL.shared.sdk ??= this.createSDK(normalizedConfig);
		this.registerLifecycleHooks(normalizedConfig);
		void this.start();
	}

	/**
	 * Creates and starts a ModunaOTEL instance.
	 *
	 * @param config SDK configuration for the current application.
	 * @returns The started ModunaOTEL wrapper.
	 */
	public static async start(config: ModunaOTELConfig): Promise<ModunaOTEL> {
		const otel = new ModunaOTEL(config);
		await otel.start();
		return otel;
	}

	/**
	 * Starts the singleton OpenTelemetry SDK.
	 */
	public async start(): Promise<void> {
		if (ModunaOTEL.shared.started) {
			return;
		}

		ModunaOTEL.shared.startPromise ??= this.startSafely();
		await ModunaOTEL.shared.startPromise;
	}

	/**
	 * Shuts down the singleton OpenTelemetry SDK.
	 */
	public async shutdown(): Promise<void> {
		ModunaOTEL.shared.shutdownPromise ??= this.shutdownSafely().finally(() => {
			ModunaOTEL.shared.shutdownPromise = undefined;
		});
		await ModunaOTEL.shared.shutdownPromise;
	}

	/**
	 * Shuts down the singleton OpenTelemetry SDK and suppresses telemetry failures.
	 */
	private async shutdownSafely(): Promise<void> {
		const sdk = ModunaOTEL.shared.sdk;

		if (!ModunaOTEL.shared.started || !sdk) {
			return;
		}

		try {
			await sdk.shutdown();
		} catch (error) {
			this.warnOnce(error);
		} finally {
			ModunaOTEL.shared.started = false;
			ModunaOTEL.shared.startPromise = undefined;
		}
	}

	/**
	 * Creates telemetry settings for one Vercel AI SDK generateText or streamText call.
	 *
	 * @param context Conversation or session identifiers for the current AI call.
	 * @returns Vercel AI SDK experimental telemetry settings.
	 */
	public vercelTelemetry(
		context: ModunaTraceContext = {},
	): ModunaVercelTelemetrySettings {
		return {
			isEnabled: true,
			metadata: this.createTraceMetadata(context),
		};
	}

	/**
	 * Creates a LangChain callback handler for per-call usage.
	 *
	 * @param context Default conversation or session identifiers.
	 * @param config Optional LangChain handler settings.
	 * @returns LangChain callback handler that emits Moduna spans.
	 */
	public langChainHandler(
		context: ModunaTraceContext = {},
		config: Omit<ModunaLangChainCallbackHandlerConfig, "traceContext"> = {},
	): ModunaLangChainCallbackHandler {
		return new ModunaLangChainCallbackHandler({
			...config,
			traceContext: context,
		});
	}

	/**
	 * Registers a LangChain callback handler for all LangChain runs.
	 *
	 * @param context Default conversation or session identifiers.
	 * @param config Optional LangChain handler settings.
	 * @returns The globally registered LangChain callback handler.
	 */
	public registerGlobalLangChainHandler(
		context: ModunaTraceContext = {},
		config: Omit<ModunaLangChainCallbackHandlerConfig, "traceContext"> = {},
	): ModunaLangChainCallbackHandler {
		const handler = this.langChainHandler(context, config);
		registerGlobalModunaLangChainHandler(handler);
		return handler;
	}

	/**
	 * Instruments a callback with a Moduna span.
	 *
	 * @param spanName Name for the emitted span.
	 * @param callback Callback executed inside the active span.
	 * @returns The callback result.
	 */
	public instrument<T>(
		spanName: string,
		callback: TraceCallback<T>,
	): Promise<T>;

	/**
	 * Instruments a callback with a Moduna span and per-call trace context.
	 *
	 * @param spanName Name for the emitted span.
	 * @param context Conversation or session identifiers for the current AI call.
	 * @param callback Callback executed inside the active span.
	 * @returns The callback result.
	 */
	public instrument<T>(
		spanName: string,
		context: ModunaTraceContext,
		callback: TraceCallback<T>,
	): Promise<T>;

	/**
	 * Instruments a callback with optional Moduna trace context.
	 */
	public async instrument<T>(
		spanName: string,
		contextOrCallback: ModunaTraceContext | TraceCallback<T>,
		callback?: TraceCallback<T>,
	): Promise<T> {
		const { traceContext, traceCallback } = this.parseInstrumentArgs(
			contextOrCallback,
			callback,
		);
		const tracer = trace.getTracer("moduna-gen-ai");

		return tracer.startActiveSpan(
			spanName,
			{ kind: SpanKind.CLIENT },
			async (span) => {
				span.setAttribute("moduna.framework", this.framework);
				span.setAttribute("sdk.integration", this.framework);
				this.applyTraceContext(span, traceContext);

				try {
					return await traceCallback(span);
				} catch (error) {
					span.recordException(error as Error);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}

	private normalizeConfig(config: ModunaOTELConfig): NormalizedConfig {
		return {
			agentName: config.agentName,
			autoShutdown: config.autoShutdown ?? true,
			apiKey: config.apiKey ?? process.env.MODUNA_API_KEY,
			framework: config.framework ?? config.sdkIntegration,
			headers: config.headers,
		};
	}

	private registerLifecycleHooks(config: NormalizedConfig): void {
		if (!config.autoShutdown || ModunaOTEL.shared.lifecycleHooksRegistered) {
			return;
		}

		process.once("beforeExit", () => {
			void this.shutdown();
		});
		process.once("SIGINT", () => {
			void this.shutdown().finally(() => {
				process.exit(130);
			});
		});
		process.once("SIGTERM", () => {
			void this.shutdown().finally(() => {
				process.exit(143);
			});
		});
		ModunaOTEL.shared.lifecycleHooksRegistered = true;
	}

	private createSDK(config: NormalizedConfig): NodeSDK {
		return new NodeSDK({
			resource: resourceFromAttributes({
				[ATTR_SERVICE_NAME]: config.agentName,
				"moduna.framework": config.framework,
				"sdk.integration": config.framework,
			}),
			traceExporter: new SilentOTLPTraceExporter(
				{
					url: DEFAULT_ENDPOINT,
					headers: {
						...(config.apiKey
							? { Authorization: `Bearer ${config.apiKey}` }
							: {}),
						...config.headers,
					},
				},
				(error) => this.warnOnce(error),
			),
		});
	}

	private async startSafely(): Promise<void> {
		const sdk = ModunaOTEL.shared.sdk;

		if (!sdk) {
			return;
		}

		try {
			await Promise.resolve(sdk.start());
			ModunaOTEL.shared.started = true;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	private createTraceMetadata(
		context: ModunaTraceContext,
	): ModunaTelemetryMetadata & Record<string, AttributeValue> {
		return {
			...(context.conversationId
				? { "moduna.conversation.id": context.conversationId }
				: {}),
			...(context.sessionId ? { "moduna.session.id": context.sessionId } : {}),
		};
	}

	private applyTraceContext(
		span: Parameters<TraceCallback<unknown>>[0],
		context: ModunaTraceContext,
	): void {
		const metadata = this.createTraceMetadata(context);

		for (const [key, value] of Object.entries(metadata)) {
			span.setAttribute(key, value);
		}
	}

	private parseInstrumentArgs<T>(
		contextOrCallback: ModunaTraceContext | TraceCallback<T>,
		callback?: TraceCallback<T>,
	): {
		traceContext: ModunaTraceContext;
		traceCallback: TraceCallback<T>;
	} {
		if (typeof contextOrCallback === "function") {
			return {
				traceContext: {},
				traceCallback: contextOrCallback,
			};
		}

		if (!callback) {
			throw new TypeError("ModunaOTEL.instrument requires a callback.");
		}

		return {
			traceContext: contextOrCallback,
			traceCallback: callback,
		};
	}

	private warnOnce(error: unknown): void {
		if (ModunaOTEL.shared.warned) {
			return;
		}

		ModunaOTEL.shared.warned = true;
		console.warn("Moduna OTEL failed to send telemetry.", error);
	}
}

export default ModunaOTEL;
