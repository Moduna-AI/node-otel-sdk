import type { AttributeValue } from "@opentelemetry/api";
import type { TraceCallback } from "@/types/TraceCallback.js";
import type {
	ModunaTelemetryMetadata,
	ModunaTraceContext,
} from "@/types/TraceContext.js";

/**
 * Creates Moduna trace metadata from conversation context.
 *
 * @param context Conversation or session identifiers.
 * @returns Attribute metadata for OpenTelemetry spans.
 */
export const createTraceMetadata = (
	context: ModunaTraceContext,
): ModunaTelemetryMetadata & Record<string, AttributeValue> => ({
	...(context.conversationId
		? { "moduna.conversation.id": context.conversationId }
		: {}),
	...(context.sessionId ? { "moduna.session.id": context.sessionId } : {}),
});

/**
 * Applies Moduna trace metadata to a span.
 *
 * @param span Span receiving trace context attributes.
 * @param context Conversation or session identifiers.
 */
export const applyTraceContext = (
	span: Parameters<TraceCallback<unknown>>[0],
	context: ModunaTraceContext,
): void => {
	const metadata = createTraceMetadata(context);

	for (const [key, value] of Object.entries(metadata)) {
		span.setAttribute(key, value);
	}
};

/**
 * Parses ModunaOTEL instrument overload arguments.
 *
 * @param contextOrCallback Trace context or callback.
 * @param callback Optional callback when context is supplied.
 * @returns Normalized trace context and callback.
 */
export const parseInstrumentArgs = <T>(
	contextOrCallback: ModunaTraceContext | TraceCallback<T>,
	callback?: TraceCallback<T>,
): {
	traceContext: ModunaTraceContext;
	traceCallback: TraceCallback<T>;
} => {
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
};
