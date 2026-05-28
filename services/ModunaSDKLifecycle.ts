import type { ModunaOTELConfig } from "@/interface/ModunaOTELConfig.js";
import {
	createModunaNodeSDK,
	normalizeModunaOTELConfig,
} from "@/services/ModunaOTELFactory.js";
import type {
	NormalizedModunaOTELConfig,
	SharedSDKState,
} from "@/services/ModunaOTELTypes.js";
import { registerProcessShutdownHooks } from "@/services/ModunaProcessHooks.js";

/**
 * Manages the singleton OpenTelemetry NodeSDK lifecycle.
 */
export class ModunaSDKLifecycle {
	private static readonly shared: SharedSDKState = {
		lifecycleHooksRegistered: false,
		started: false,
		warned: false,
	};

	/**
	 * Runtime configuration used by this lifecycle wrapper.
	 */
	public readonly config: NormalizedModunaOTELConfig;

	/**
	 * Creates the singleton SDK when it does not already exist.
	 *
	 * @param config Public SDK configuration.
	 */
	public constructor(config: ModunaOTELConfig) {
		this.config = normalizeModunaOTELConfig(config);
		ModunaSDKLifecycle.shared.sdk ??= createModunaNodeSDK(
			this.config,
			(error) => this.warnOnce(error),
		);
		this.registerShutdownHooks();
	}

	/**
	 * Starts the singleton OpenTelemetry SDK.
	 */
	public async start(): Promise<void> {
		if (ModunaSDKLifecycle.shared.started) {
			return;
		}

		ModunaSDKLifecycle.shared.startPromise ??= this.startSafely();
		await ModunaSDKLifecycle.shared.startPromise;
	}

	/**
	 * Shuts down the singleton OpenTelemetry SDK.
	 */
	public async shutdown(): Promise<void> {
		ModunaSDKLifecycle.shared.shutdownPromise ??= this.shutdownSafely().finally(
			() => {
				ModunaSDKLifecycle.shared.shutdownPromise = undefined;
			},
		);
		await ModunaSDKLifecycle.shared.shutdownPromise;
	}

	private async startSafely(): Promise<void> {
		const sdk = ModunaSDKLifecycle.shared.sdk;

		if (!sdk) {
			return;
		}

		try {
			await Promise.resolve(sdk.start());
			ModunaSDKLifecycle.shared.started = true;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	private async shutdownSafely(): Promise<void> {
		const sdk = ModunaSDKLifecycle.shared.sdk;

		if (!ModunaSDKLifecycle.shared.started || !sdk) {
			return;
		}

		try {
			await sdk.shutdown();
		} catch (error) {
			this.warnOnce(error);
		} finally {
			ModunaSDKLifecycle.shared.started = false;
			ModunaSDKLifecycle.shared.startPromise = undefined;
		}
	}

	private registerShutdownHooks(): void {
		if (ModunaSDKLifecycle.shared.lifecycleHooksRegistered) {
			return;
		}

		ModunaSDKLifecycle.shared.lifecycleHooksRegistered =
			registerProcessShutdownHooks(this.config, () => this.shutdown());
	}

	private warnOnce(error: unknown): void {
		if (ModunaSDKLifecycle.shared.warned) {
			return;
		}

		ModunaSDKLifecycle.shared.warned = true;
		console.warn("Moduna OTEL failed to send telemetry.", error);
	}
}
