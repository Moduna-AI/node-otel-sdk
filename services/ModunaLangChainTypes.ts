import type { Serialized } from "@langchain/core/load/serializable";
import type { Span } from "@opentelemetry/api";
import type { ModunaTraceContext } from "@/types/TraceContext.js";

/**
 * Configuration for Moduna's LangChain callback handler.
 */
export interface ModunaLangChainCallbackHandlerConfig {
	/**
	 * Enables trace lifecycle logging for LangChain callback events.
	 */
	debug?: boolean;

	/**
	 * Logger used when debug trace logging is enabled.
	 */
	logger?: Pick<Console, "debug" | "error">;

	/**
	 * Default trace identifiers used when a LangChain call has no metadata.
	 */
	traceContext?: ModunaTraceContext;
}

/**
 * Active LangChain run tracked until the callback ends or errors.
 */
export interface ActiveLangChainRun {
	/**
	 * OpenTelemetry span for the LangChain run.
	 */
	span: Span;

	/**
	 * Number of tokens observed through streaming callbacks.
	 */
	streamedTokenCount: number;

	/**
	 * LangChain run type represented by the span.
	 */
	runType: LangChainRunType;
}

/**
 * Additional debug values attached to a trace lifecycle log.
 */
export interface DebugLogPayload {
	/**
	 * Additional debug values attached to a trace lifecycle log.
	 */
	[key: string]: unknown;
}

/**
 * GenAI-compatible role/content message.
 */
export interface NormalizedMessage {
	/**
	 * Message content encoded for OpenTelemetry attributes.
	 */
	content: string;

	/**
	 * OpenAI-compatible role name for the message.
	 */
	role: string;
}

/**
 * Token usage normalized from LangChain/provider result metadata.
 */
export interface TokenUsage {
	/**
	 * Completion tokens emitted by the model.
	 */
	completionTokens?: number;

	/**
	 * Prompt tokens consumed by the model.
	 */
	promptTokens?: number;

	/**
	 * Reasoning tokens emitted by reasoning-capable models.
	 */
	reasoningTokens?: number;

	/**
	 * Total tokens consumed by the model request.
	 */
	totalTokens?: number;
}

/**
 * LangChain LLM run shape emitted by callbacks.
 */
export type LangChainRunType = "chat_model" | "llm";

/**
 * Input used to start a LangChain telemetry span.
 */
export interface StartLangChainRunInput {
	/**
	 * Provider-specific invocation parameters.
	 */
	extraParams?: Record<string, unknown>;

	/**
	 * Number of prompt messages or prompts.
	 */
	inputCount: number;

	/**
	 * Normalized prompt messages.
	 */
	inputMessages: NormalizedMessage[];

	/**
	 * Serialized LangChain model metadata.
	 */
	llm: Serialized;

	/**
	 * LangChain run metadata.
	 */
	metadata?: Record<string, unknown>;

	/**
	 * Parent run identifier, when present.
	 */
	parentRunId?: string;

	/**
	 * LangChain run identifier.
	 */
	runId: string;

	/**
	 * LangChain run name.
	 */
	runName?: string;

	/**
	 * LangChain LLM run type.
	 */
	runType: LangChainRunType;

	/**
	 * LangChain run tags.
	 */
	tags?: string[];
}
