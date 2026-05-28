import type { Span } from "@opentelemetry/api";
import type { DebugLogPayload } from "@/services/ModunaLangChainTypes.js";

/**
 * Emits LangChain trace lifecycle debug logs.
 */
export class LangChainDebugLogger {
	/**
	 * Creates a debug logger.
	 *
	 * @param enabled Whether debug logging is enabled.
	 * @param logger Console-compatible logger.
	 */
	public constructor(
		private readonly enabled: boolean,
		private readonly logger: Pick<Console, "debug" | "error">,
	) {}

	/**
	 * Emits a trace lifecycle log when debug mode is enabled.
	 *
	 * @param event Trace lifecycle event name.
	 * @param span Span associated with the lifecycle event.
	 * @param payload Additional event fields.
	 */
	public log(
		event: "end" | "error" | "start" | "token",
		span: Span,
		payload: DebugLogPayload,
	): void {
		if (!this.enabled) {
			return;
		}

		const spanContext = span.spanContext();
		const logPayload = {
			event,
			spanId: spanContext.spanId,
			traceId: spanContext.traceId,
			...payload,
		};

		if (event === "error") {
			this.logger.error("[moduna:langchain]", logPayload);
			return;
		}

		this.logger.debug("[moduna:langchain]", logPayload);
	}
}
