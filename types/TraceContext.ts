/**
 * Per-call identifiers that are attached to Moduna trace spans.
 */
export interface ModunaTraceContext {
    /**
     * Identifier for a multi-message conversation.
     */
    conversationId?: string;

    /**
     * Identifier for a broader user or application session.
     */
    sessionId?: string;
}

/**
 * Metadata keys emitted for Vercel AI SDK telemetry spans.
 */
export type ModunaTelemetryMetadataKey =
    | "moduna.conversation.id"
    | "moduna.session.id";

/**
 * Vercel AI SDK metadata generated from Moduna trace context.
 */
export type ModunaTelemetryMetadata = Partial<
    Record<ModunaTelemetryMetadataKey, string>
>;
