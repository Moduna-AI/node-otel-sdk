import process from "node:process";
import type { NormalizedModunaOTELConfig } from "@/services/ModunaOTELTypes.js";

/**
 * Registers Node.js lifecycle hooks for telemetry shutdown.
 *
 * @param config Normalized SDK configuration.
 * @param shutdown Shutdown callback for the singleton SDK.
 * @returns Whether lifecycle hooks were registered.
 */
export const registerProcessShutdownHooks = (
	config: NormalizedModunaOTELConfig,
	shutdown: () => Promise<void>,
): boolean => {
	if (!config.autoShutdown) {
		return false;
	}

	process.once("beforeExit", () => {
		void shutdown();
	});
	process.once("SIGINT", () => {
		void shutdown().finally(() => {
			process.exit(130);
		});
	});
	process.once("SIGTERM", () => {
		void shutdown().finally(() => {
			process.exit(143);
		});
	});

	return true;
};
