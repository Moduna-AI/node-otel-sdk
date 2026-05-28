import type { AttributeValue } from "@opentelemetry/api";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import type { ModunaOTELFramework } from "@/types/SupportedSDK.js";
import type { ModunaTelemetryMetadata } from "@/types/TraceContext.js";

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

/**
 * Runtime configuration after defaults and environment fallbacks are applied.
 */
export interface NormalizedModunaOTELConfig {
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

/**
 * Singleton OpenTelemetry SDK state shared by ModunaOTEL wrappers.
 */
export interface SharedSDKState {
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
