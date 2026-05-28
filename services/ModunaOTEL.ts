import { SpanKind, trace } from "@opentelemetry/api";
import type { ModunaOTELConfig } from "@/interface/ModunaOTELConfig.js";
import type { ModunaLangChainCallbackHandlerConfig } from "@/services/ModunaLangChainCallbackHandler.js";
import {
	ModunaLangChainCallbackHandler,
	registerGlobalModunaLangChainHandler,
} from "@/services/ModunaLangChainCallbackHandler.js";
import type { ModunaVercelTelemetrySettings } from "@/services/ModunaOTELTypes.js";
import { ModunaSDKLifecycle } from "@/services/ModunaSDKLifecycle.js";
import {
	applyTraceContext,
	createTraceMetadata,
	parseInstrumentArgs,
} from "@/services/ModunaTraceMetadata.js";
import type { ModunaOTELFramework } from "@/types/SupportedSDK.js";
import type { TraceCallback } from "@/types/TraceCallback.js";
import type { ModunaTraceContext } from "@/types/TraceContext.js";

export type { ModunaVercelTelemetrySettings } from "@/services/ModunaOTELTypes.js";

/**
 * One-line OpenTelemetry setup for Moduna AI traces.
 */
export class ModunaOTEL {
	private readonly framework: ModunaOTELFramework;

	private readonly lifecycle: ModunaSDKLifecycle;

	/**
	 * Creates a Moduna OTEL wrapper and starts telemetry asynchronously.
	 *
	 * @param config SDK configuration for the current application.
	 */
	public constructor(config: ModunaOTELConfig) {
		this.lifecycle = new ModunaSDKLifecycle(config);
		this.framework = this.lifecycle.config.framework;
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
		await this.lifecycle.start();
	}

	/**
	 * Shuts down the singleton OpenTelemetry SDK.
	 */
	public async shutdown(): Promise<void> {
		await this.lifecycle.shutdown();
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
			metadata: createTraceMetadata(context),
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
		const { traceContext, traceCallback } = parseInstrumentArgs(
			contextOrCallback,
			callback,
		);

		return trace
			.getTracer("moduna-gen-ai")
			.startActiveSpan(spanName, { kind: SpanKind.CLIENT }, async (span) => {
				span.setAttribute("moduna.framework", this.framework);
				span.setAttribute("sdk.integration", this.framework);
				applyTraceContext(span, traceContext);

				try {
					return await traceCallback(span);
				} catch (error) {
					span.recordException(error as Error);
					throw error;
				} finally {
					span.end();
				}
			});
	}
}

export default ModunaOTEL;
