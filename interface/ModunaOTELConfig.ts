import type {
	ModunaOTELFramework,
	ModunaOTELSDKIntegration,
} from "../types/SupportedSDK.js";

/**
 * Shared configuration for the Moduna OpenTelemetry SDK.
 */
interface ModunaOTELBaseConfig {
	/**
	 * API key for authenticating with Moduna. Falls back to MODUNA_API_KEY.
	 */
	apiKey?: string;

	/**
	 * Service name attached to emitted OpenTelemetry resources.
	 */
	agentName: string;

	/**
	 * Additional OTLP headers sent with telemetry exports.
	 */
	headers?: Record<string, string>;

	/**
	 * Automatically flushes and shuts down telemetry when the Node.js process exits.
	 */
	autoShutdown?: boolean;
}

/**
 * Configuration options for a ModunaOTEL instance.
 */
export type ModunaOTELConfig = ModunaOTELBaseConfig &
	(
		| {
				/**
				 * Framework that will use the Moduna OpenTelemetry SDK.
				 */
				framework: ModunaOTELFramework;

				/**
				 * Deprecated. Use framework instead.
				 */
				sdkIntegration?: ModunaOTELSDKIntegration;
		  }
		| {
				/**
				 * Framework that will use the Moduna OpenTelemetry SDK.
				 */
				framework?: ModunaOTELFramework;

				/**
				 * Deprecated. Use framework instead.
				 */
				sdkIntegration: ModunaOTELSDKIntegration;
		  }
	);
