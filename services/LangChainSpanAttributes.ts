import type { Serialized } from "@langchain/core/load/serializable";
import type { Span } from "@opentelemetry/api";
import {
	getRecord,
	getString,
	toAttributeValue,
} from "@/services/LangChainValueUtils.js";
import type { NormalizedMessage } from "@/services/ModunaLangChainTypes.js";
import type { ModunaTraceContext } from "@/types/TraceContext.js";

const INVOCATION_ATTRIBUTE_MAPPINGS: Array<[string, string]> = [
	["temperature", "gen_ai.request.temperature"],
	["top_p", "gen_ai.request.top_p"],
	["topP", "gen_ai.request.top_p"],
	["max_tokens", "gen_ai.request.max_tokens"],
	["maxOutputTokens", "gen_ai.request.max_tokens"],
	["maxTokens", "gen_ai.request.max_tokens"],
	["frequency_penalty", "gen_ai.request.frequency_penalty"],
	["frequencyPenalty", "gen_ai.request.frequency_penalty"],
	["presence_penalty", "gen_ai.request.presence_penalty"],
	["presencePenalty", "gen_ai.request.presence_penalty"],
	["seed", "gen_ai.request.seed"],
	["stop", "gen_ai.request.stop_sequences"],
	["stop_sequences", "gen_ai.request.stop_sequences"],
	["stopSequences", "gen_ai.request.stop_sequences"],
	["top_k", "gen_ai.request.top_k"],
	["topK", "gen_ai.request.top_k"],
	["encoding_formats", "gen_ai.request.encoding_formats"],
	["encodingFormats", "gen_ai.request.encoding_formats"],
];

const TOOL_ATTRIBUTE_MAPPINGS: Array<[string, string]> = [
	["tools", "tools"],
	["tool_name", "gen_ai.tool.name"],
	["toolName", "gen_ai.tool.name"],
	["tool_arguments", "tool_arguments"],
	["toolArguments", "tool_arguments"],
];

/**
 * Applies LangChain request and prompt attributes to spans.
 */
export class LangChainSpanAttributes {
	/**
	 * Creates a span attribute applier.
	 *
	 * @param defaultTraceContext Default Moduna trace identifiers.
	 */
	public constructor(
		private readonly defaultTraceContext: ModunaTraceContext,
	) {}

	/**
	 * Applies model/provider attributes using LangChain serialization metadata.
	 *
	 * @param span Span receiving model attributes.
	 * @param llm Serialized LangChain model metadata.
	 * @param extraParams Provider-specific invocation parameters.
	 */
	public applyModelAttributes(
		span: Span,
		llm: Serialized,
		extraParams?: Record<string, unknown>,
	): void {
		const invocationParams = getRecord(extraParams, "invocation_params");
		const modelName =
			getString(invocationParams, "model") ??
			getString(invocationParams, "modelName") ??
			getString(invocationParams, "model_name") ??
			getString(llm, "name") ??
			llm.id.join(".");
		const provider =
			getString(invocationParams, "model_provider") ??
			getString(invocationParams, "provider") ??
			this.inferProvider(llm, modelName);

		span.setAttribute("gen_ai.system", provider);
		span.setAttribute("gen_ai.request.model", modelName);
		span.setAttribute("gen_ai.response.model", modelName);
		span.setAttribute("llm.model_name", modelName);
		span.setAttribute("metadata.ls_provider", provider);
		span.setAttribute("metadata.ls_model_name", modelName);
		span.setAttribute("langchain.serialized.id", llm.id.join("."));
	}

	/**
	 * Applies Moduna conversation and session identifiers to a span.
	 *
	 * @param span Span receiving trace context attributes.
	 * @param metadata LangChain metadata supplied on the run.
	 */
	public applyTraceContext(
		span: Span,
		metadata?: Record<string, unknown>,
	): void {
		const traceContext = {
			conversationId:
				getString(metadata, "conversationId") ??
				getString(metadata, "moduna.conversation.id") ??
				this.defaultTraceContext.conversationId,
			sessionId:
				getString(metadata, "sessionId") ??
				getString(metadata, "moduna.session.id") ??
				this.defaultTraceContext.sessionId,
		};

		if (traceContext.conversationId) {
			span.setAttribute("moduna.conversation.id", traceContext.conversationId);
			span.setAttribute(
				"langsmith.metadata.conversation_id",
				traceContext.conversationId,
			);
		}

		if (traceContext.sessionId) {
			span.setAttribute("moduna.session.id", traceContext.sessionId);
			span.setAttribute(
				"langsmith.metadata.session_id",
				traceContext.sessionId,
			);
			span.setAttribute("langsmith.trace.session_id", traceContext.sessionId);
		}
	}

	/**
	 * Applies prompt input attributes in LangSmith-compatible GenAI format.
	 *
	 * @param span Span receiving prompt attributes.
	 * @param messages Normalized prompt messages.
	 */
	public applyPromptAttributes(
		span: Span,
		messages: NormalizedMessage[],
	): void {
		if (messages.length === 0) {
			return;
		}

		for (const [index, message] of messages.entries()) {
			span.setAttribute(`gen_ai.prompt.${index}.role`, message.role);
			span.setAttribute(`gen_ai.prompt.${index}.content`, message.content);
			span.setAttribute(`gen_ai.prompt.${index}.message.role`, message.role);
			span.setAttribute(
				`gen_ai.prompt.${index}.message.content`,
				message.content,
			);
		}

		span.setAttribute("gen_ai.prompt", JSON.stringify(messages));
		span.setAttribute("gen_ai.input.messages", JSON.stringify(messages));
		span.addEvent("gen_ai.content.prompt", {
			content: JSON.stringify(messages),
		});
	}

	/**
	 * Applies request parameter attributes in GenAI semantic format.
	 *
	 * @param span Span receiving invocation parameter attributes.
	 * @param extraParams Provider-specific invocation parameters.
	 */
	public applyInvocationAttributes(
		span: Span,
		extraParams?: Record<string, unknown>,
	): void {
		const invocationParams = getRecord(extraParams, "invocation_params");

		if (!invocationParams) {
			return;
		}

		for (const [sourceKey, attributeKey] of INVOCATION_ATTRIBUTE_MAPPINGS) {
			this.setAttributeIfSupported(
				span,
				attributeKey,
				invocationParams[sourceKey],
			);
		}

		for (const [sourceKey, attributeKey] of TOOL_ATTRIBUTE_MAPPINGS) {
			this.setAttributeIfSupported(
				span,
				attributeKey,
				invocationParams[sourceKey],
			);
		}

		span.setAttribute(
			"llm.invocation_parameters",
			JSON.stringify(invocationParams),
		);
	}

	private inferProvider(llm: Serialized, modelName: string): string {
		const serializedId = llm.id.join(".").toLowerCase();
		const model = modelName.toLowerCase();

		if (serializedId.includes("google") || model.includes("gemini")) {
			return "google";
		}

		if (serializedId.includes("openai") || model.includes("gpt")) {
			return "openai";
		}

		if (serializedId.includes("anthropic") || model.includes("claude")) {
			return "anthropic";
		}

		return llm.id.at(-1) ?? "unknown";
	}

	private setAttributeIfSupported(
		span: Span,
		key: string,
		value: unknown,
	): void {
		const attributeValue = toAttributeValue(value);

		if (attributeValue !== undefined) {
			span.setAttribute(key, attributeValue);
		}
	}
}
