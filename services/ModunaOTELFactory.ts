import process from "node:process";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ModunaOTELConfig } from "@/interface/ModunaOTELConfig.js";
import type { NormalizedModunaOTELConfig } from "@/services/ModunaOTELTypes.js";
import { SilentOTLPTraceExporter } from "@/services/SilentOTLPTraceExporter.js";

const DEFAULT_ENDPOINT =
	"https://volex-otel-git-506013021984.us-central1.run.app/v1/traces";

/**
 * Normalizes public Moduna OTEL configuration.
 *
 * @param config SDK configuration supplied by the user.
 * @returns Runtime configuration with defaults applied.
 */
export const normalizeModunaOTELConfig = (
	config: ModunaOTELConfig,
): NormalizedModunaOTELConfig => ({
	agentName: config.agentName,
	autoShutdown: config.autoShutdown ?? true,
	apiKey: config.apiKey ?? process.env.MODUNA_API_KEY,
	framework: config.framework ?? config.sdkIntegration,
	headers: config.headers,
});

/**
 * Creates the singleton OpenTelemetry NodeSDK instance.
 *
 * @param config Normalized SDK configuration.
 * @param onFailure Callback invoked when telemetry export fails.
 * @returns OpenTelemetry NodeSDK configured for Moduna.
 */
export const createModunaNodeSDK = (
	config: NormalizedModunaOTELConfig,
	onFailure: (error: unknown) => void,
): NodeSDK =>
	new NodeSDK({
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
			onFailure,
		),
	});
