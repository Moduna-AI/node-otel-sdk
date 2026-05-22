import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
	registerConfigureHook,
	setContextVariable,
} from "@langchain/core/context";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import type { AttributeValue, Span } from "@opentelemetry/api";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { ModunaTraceContext } from "../types/TraceContext.js";

const MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY =
	"moduna.otel.langchain.callbackHandler";

let isConfigureHookRegistered = false;

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

interface ActiveLangChainRun {
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
	runType: "chat_model" | "llm";
}

interface DebugLogPayload {
	/**
	 * Additional debug values attached to a trace lifecycle log.
	 */
	[key: string]: unknown;
}

interface NormalizedMessage {
	/**
	 * Message content encoded for OpenTelemetry attributes.
	 */
	content: string;

	/**
	 * OpenAI-compatible role name for the message.
	 */
	role: string;
}

interface TokenUsage {
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
 * LangChain callback handler that emits Moduna OpenTelemetry spans.
 */
export class ModunaLangChainCallbackHandler extends BaseCallbackHandler {
	/**
	 * Stable handler name used by LangChain callback manager de-duplication.
	 */
	public name = "moduna_otel_langchain_callback_handler";

	private readonly debug: boolean;

	private readonly defaultTraceContext: ModunaTraceContext;

	private readonly logger: Pick<Console, "debug" | "error">;

	private readonly runs = new Map<string, ActiveLangChainRun>();

	/**
	 * Creates a LangChain callback handler for Moduna spans.
	 *
	 * @param config Optional default trace identifiers.
	 */
	public constructor(config: ModunaLangChainCallbackHandlerConfig = {}) {
		super();
		this.debug = config.debug ?? false;
		this.defaultTraceContext = config.traceContext ?? {};
		this.logger = config.logger ?? console;
	}

	/**
	 * Starts a span for a LangChain chat model run.
	 *
	 * @param llm Serialized LangChain model metadata.
	 * @param messages Messages sent to the chat model.
	 * @param runId LangChain run identifier.
	 * @param parentRunId Parent run identifier, when present.
	 * @param extraParams Provider-specific run parameters.
	 * @param tags LangChain run tags.
	 * @param metadata LangChain run metadata.
	 * @param runName LangChain run name.
	 */
	public handleChatModelStart(
		llm: Serialized,
		messages: BaseMessage[][],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		runName?: string,
	): void {
		this.startRun({
			extraParams,
			inputCount: messages.flat().length,
			inputMessages: this.normalizeMessageBatches(messages),
			llm,
			metadata,
			parentRunId,
			runId,
			runName,
			runType: "chat_model",
			tags,
		});
	}

	/**
	 * Starts a span for a LangChain LLM run.
	 *
	 * @param llm Serialized LangChain model metadata.
	 * @param prompts Prompts sent to the LLM.
	 * @param runId LangChain run identifier.
	 * @param parentRunId Parent run identifier, when present.
	 * @param extraParams Provider-specific run parameters.
	 * @param tags LangChain run tags.
	 * @param metadata LangChain run metadata.
	 * @param runName LangChain run name.
	 */
	public handleLLMStart(
		llm: Serialized,
		prompts: string[],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		runName?: string,
	): void {
		this.startRun({
			extraParams,
			inputCount: prompts.length,
			inputMessages: prompts.map((prompt) => ({
				content: prompt,
				role: "user",
			})),
			llm,
			metadata,
			parentRunId,
			runId,
			runName,
			runType: "llm",
			tags,
		});
	}

	/**
	 * Records a streamed token count signal on the active LangChain span.
	 *
	 * @param _token New token emitted by LangChain.
	 * @param _idx Token indices from LangChain.
	 * @param runId LangChain run identifier.
	 */
	public handleLLMNewToken(_token: string, _idx: unknown, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}

		run.streamedTokenCount += 1;
		run.span.addEvent("gen_ai.content.completion", {
			content: _token,
			role: "assistant",
		});
		this.debugLog("token", run.span, {
			runId,
			runType: run.runType,
			streamedTokenCount: run.streamedTokenCount,
			tokenLength: _token.length,
		});
	}

	/**
	 * Ends the span for a successful LangChain run.
	 *
	 * @param output LangChain LLM output.
	 * @param runId LangChain run identifier.
	 */
	public handleLLMEnd(output: LLMResult, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}

		run.span.setAttribute(
			"langchain.output.generations",
			output.generations.length,
		);
		run.span.setAttribute(
			"langchain.output.candidates",
			this.countGenerations(output),
		);
		this.applyCompletionAttributes(run.span, output);
		this.applyUsageAttributes(run.span, output, run.streamedTokenCount);
		this.debugLog("end", run.span, {
			candidateCount: this.countGenerations(output),
			generationCount: output.generations.length,
			runId,
			runType: run.runType,
			streamedTokenCount: run.streamedTokenCount,
			usage: this.extractUsage(output),
		});
		run.span.setStatus({ code: SpanStatusCode.OK });
		run.span.end();
		this.runs.delete(runId);
	}

	/**
	 * Records an error and ends the span for a failed LangChain run.
	 *
	 * @param error Error emitted by LangChain.
	 * @param runId LangChain run identifier.
	 */
	public handleLLMError(error: unknown, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}

		const normalizedError = this.toError(error);

		run.span.recordException(normalizedError);
		run.span.setStatus({
			code: SpanStatusCode.ERROR,
			message: normalizedError.message,
		});
		this.debugLog("error", run.span, {
			errorName: normalizedError.name,
			errorMessage: normalizedError.message,
			runId,
			runType: run.runType,
		});
		run.span.end();
		this.runs.delete(runId);
	}

	private startRun(input: {
		extraParams?: Record<string, unknown>;
		inputCount: number;
		inputMessages: NormalizedMessage[];
		llm: Serialized;
		metadata?: Record<string, unknown>;
		parentRunId?: string;
		runId: string;
		runName?: string;
		runType: "chat_model" | "llm";
		tags?: string[];
	}): void {
		const tracer = trace.getTracer("moduna-langchain");
		const span = tracer.startSpan(input.runName ?? "langchain.llm", {
			kind: SpanKind.CLIENT,
		});

		span.setAttribute("moduna.framework", "langchain");
		span.setAttribute("sdk.integration", "langchain");
		span.setAttribute("langchain.run.id", input.runId);
		span.setAttribute("langchain.run.type", input.runType);
		span.setAttribute("langchain.input.count", input.inputCount);
		span.setAttribute("langsmith.span.kind", "llm");
		span.setAttribute(
			"gen_ai.operation.name",
			input.runType === "chat_model" ? "chat" : "completion",
		);
		span.setAttribute(
			"llm.request.type",
			input.runType === "chat_model" ? "chat" : "completion",
		);

		if (input.parentRunId) {
			span.setAttribute("langchain.parent_run.id", input.parentRunId);
		}

		if (input.runName) {
			span.setAttribute("langsmith.trace.name", input.runName);
		}

		if (input.tags?.length) {
			span.setAttribute("langchain.tags", input.tags.join(","));
			span.setAttribute("langsmith.span.tags", input.tags.join(","));
		}

		this.applyModelAttributes(span, input.llm, input.extraParams);
		this.applyPromptAttributes(span, input.inputMessages);
		this.applyInvocationAttributes(span, input.extraParams);
		this.applyTraceContext(span, input.metadata);
		this.runs.set(input.runId, {
			runType: input.runType,
			span,
			streamedTokenCount: 0,
		});
		this.debugLog("start", span, {
			inputCount: input.inputCount,
			parentRunId: input.parentRunId,
			runId: input.runId,
			runName: input.runName,
			runType: input.runType,
			tags: input.tags,
		});
	}

	/**
	 * Applies model/provider attributes using LangChain serialization metadata.
	 *
	 * @param span Span receiving model attributes.
	 * @param llm Serialized LangChain model metadata.
	 * @param extraParams Provider-specific invocation parameters.
	 */
	private applyModelAttributes(
		span: Span,
		llm: Serialized,
		extraParams?: Record<string, unknown>,
	): void {
		const invocationParams = this.getRecord(extraParams, "invocation_params");
		const modelName =
			this.getString(invocationParams, "model") ??
			this.getString(invocationParams, "modelName") ??
			this.getString(invocationParams, "model_name") ??
			this.getString(llm, "name") ??
			llm.id.join(".");
		const provider =
			this.getString(invocationParams, "model_provider") ??
			this.getString(invocationParams, "provider") ??
			this.inferProvider(llm, modelName);

		span.setAttribute("gen_ai.system", provider);
		span.setAttribute("gen_ai.request.model", modelName);
		span.setAttribute("llm.model_name", modelName);
		span.setAttribute("metadata.ls_model_name", modelName);
		span.setAttribute("langchain.serialized.id", llm.id.join("."));
	}

	/**
	 * Applies Moduna conversation and session identifiers to a span.
	 *
	 * @param span Span receiving trace context attributes.
	 * @param metadata LangChain metadata supplied on the run.
	 */
	private applyTraceContext(
		span: Span,
		metadata?: Record<string, unknown>,
	): void {
		const traceContext = {
			conversationId:
				this.getString(metadata, "conversationId") ??
				this.getString(metadata, "moduna.conversation.id") ??
				this.defaultTraceContext.conversationId,
			sessionId:
				this.getString(metadata, "sessionId") ??
				this.getString(metadata, "moduna.session.id") ??
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
	private applyPromptAttributes(
		span: Span,
		messages: NormalizedMessage[],
	): void {
		if (messages.length === 0) {
			return;
		}

		for (const [index, message] of messages.entries()) {
			span.setAttribute(`gen_ai.prompt.${index}.role`, message.role);
			span.setAttribute(`gen_ai.prompt.${index}.content`, message.content);
		}

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
	private applyInvocationAttributes(
		span: Span,
		extraParams?: Record<string, unknown>,
	): void {
		const invocationParams = this.getRecord(extraParams, "invocation_params");

		if (!invocationParams) {
			return;
		}

		const mappings: Array<[string, string]> = [
			["temperature", "gen_ai.request.temperature"],
			["top_p", "gen_ai.request.top_p"],
			["max_tokens", "gen_ai.request.max_tokens"],
			["maxOutputTokens", "gen_ai.request.max_tokens"],
			["frequency_penalty", "gen_ai.request.frequency_penalty"],
			["presence_penalty", "gen_ai.request.presence_penalty"],
			["seed", "gen_ai.request.seed"],
			["stop", "gen_ai.request.stop_sequences"],
			["stop_sequences", "gen_ai.request.stop_sequences"],
			["top_k", "gen_ai.request.top_k"],
			["encoding_formats", "gen_ai.request.encoding_formats"],
			["tools", "tools"],
		];

		for (const [sourceKey, attributeKey] of mappings) {
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

	/**
	 * Applies model completion output attributes from a LangChain result.
	 *
	 * @param span Span receiving completion attributes.
	 * @param output LangChain LLM output.
	 */
	private applyCompletionAttributes(span: Span, output: LLMResult): void {
		const messages: NormalizedMessage[] = [];

		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = this.getGenerationMessage(generation);
				messages.push(
					message ?? {
						content: generation.text,
						role: "assistant",
					},
				);
			}
		}

		for (const [index, message] of messages.entries()) {
			span.setAttribute(`gen_ai.completion.${index}.role`, message.role);
			span.setAttribute(`gen_ai.completion.${index}.content`, message.content);
		}

		if (messages.length > 0) {
			span.setAttribute("gen_ai.output.messages", JSON.stringify(messages));
			span.addEvent("gen_ai.content.completion", {
				content: JSON.stringify(messages),
			});
		}

		const responseModel = this.getResponseModel(output);

		if (responseModel) {
			span.setAttribute("gen_ai.response.model", responseModel);
		}
	}

	/**
	 * Applies token usage attributes from a LangChain result.
	 *
	 * @param span Span receiving usage attributes.
	 * @param output LangChain LLM output.
	 * @param streamedTokenCount Token count observed from streaming callbacks.
	 */
	private applyUsageAttributes(
		span: Span,
		output: LLMResult,
		streamedTokenCount: number,
	): void {
		const usage = this.extractUsage(output);

		if (usage.promptTokens !== undefined) {
			span.setAttribute("gen_ai.usage.input_tokens", usage.promptTokens);
			span.setAttribute("gen_ai.usage.prompt_tokens", usage.promptTokens);
			span.setAttribute("llm.token_count.prompt", usage.promptTokens);
		}

		const completionTokens =
			usage.completionTokens ??
			(streamedTokenCount > 0 ? streamedTokenCount : undefined);

		if (completionTokens !== undefined) {
			span.setAttribute("gen_ai.usage.output_tokens", completionTokens);
			span.setAttribute("gen_ai.usage.completion_tokens", completionTokens);
			span.setAttribute("llm.token_count.completion", completionTokens);
		}

		if (usage.totalTokens !== undefined) {
			span.setAttribute("gen_ai.usage.total_tokens", usage.totalTokens);
			span.setAttribute("llm.token_count.total", usage.totalTokens);
			span.setAttribute("llm.usage.total_tokens", usage.totalTokens);
		}

		if (usage.reasoningTokens !== undefined) {
			span.setAttribute(
				"gen_ai.usage.details.reasoning_tokens",
				usage.reasoningTokens,
			);
		}
	}

	/**
	 * Extracts token usage from LangChain result metadata and provider outputs.
	 *
	 * @param output LangChain LLM output.
	 * @returns Normalized token usage when present.
	 */
	private extractUsage(output: LLMResult): TokenUsage {
		const usageMetadata = this.getFirstUsageMetadata(output);
		const tokenUsage = this.getRecord(output.llmOutput, "tokenUsage");
		const estimatedTokenUsage = this.getRecord(
			output.llmOutput,
			"estimatedTokenUsage",
		);

		return {
			completionTokens:
				this.getNumber(usageMetadata, "output_tokens") ??
				this.getNumber(tokenUsage, "completionTokens") ??
				this.getNumber(tokenUsage, "completion_tokens") ??
				this.getNumber(estimatedTokenUsage, "completionTokens"),
			promptTokens:
				this.getNumber(usageMetadata, "input_tokens") ??
				this.getNumber(tokenUsage, "promptTokens") ??
				this.getNumber(tokenUsage, "prompt_tokens") ??
				this.getNumber(estimatedTokenUsage, "promptTokens"),
			reasoningTokens: this.getNumber(
				this.getRecord(usageMetadata, "output_token_details"),
				"reasoning",
			),
			totalTokens:
				this.getNumber(usageMetadata, "total_tokens") ??
				this.getNumber(tokenUsage, "totalTokens") ??
				this.getNumber(tokenUsage, "total_tokens") ??
				this.getNumber(estimatedTokenUsage, "totalTokens"),
		};
	}

	/**
	 * Finds the first message usage metadata in a LangChain result.
	 *
	 * @param output LangChain LLM output.
	 * @returns Usage metadata record when present.
	 */
	private getFirstUsageMetadata(
		output: LLMResult,
	): Record<string, unknown> | undefined {
		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = this.getMessageLike(generation);
				const usageMetadata = this.getRecord(message, "usage_metadata");

				if (usageMetadata) {
					return usageMetadata;
				}
			}
		}

		return undefined;
	}

	/**
	 * Finds the model name returned by the provider, when available.
	 *
	 * @param output LangChain LLM output.
	 * @returns Provider response model name when present.
	 */
	private getResponseModel(output: LLMResult): string | undefined {
		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = this.getMessageLike(generation);
				const responseMetadata = this.getRecord(message, "response_metadata");
				const model =
					this.getString(responseMetadata, "model_name") ??
					this.getString(responseMetadata, "model") ??
					this.getString(output.llmOutput, "model");

				if (model) {
					return model;
				}
			}
		}

		return this.getString(output.llmOutput, "model");
	}

	/**
	 * Counts all generated candidates in a LangChain result.
	 *
	 * @param output LangChain LLM output.
	 * @returns Total generation candidate count.
	 */
	private countGenerations(output: LLMResult): number {
		return output.generations.reduce(
			(count, generationGroup) => count + generationGroup.length,
			0,
		);
	}

	/**
	 * Converts batches of LangChain messages to flat normalized messages.
	 *
	 * @param messageBatches LangChain message batches.
	 * @returns Flat list of normalized prompt messages.
	 */
	private normalizeMessageBatches(
		messageBatches: BaseMessage[][],
	): NormalizedMessage[] {
		return messageBatches.flatMap((messages) =>
			messages.map((message) => this.normalizeMessage(message)),
		);
	}

	/**
	 * Converts a LangChain message to a GenAI-compatible role/content pair.
	 *
	 * @param message LangChain base message.
	 * @returns Normalized message.
	 */
	private normalizeMessage(message: BaseMessage): NormalizedMessage {
		return {
			content:
				typeof message.content === "string"
					? message.content
					: JSON.stringify(message.content),
			role: this.mapMessageRole(message.type),
		};
	}

	/**
	 * Converts LangChain message types to GenAI/OpenAI role names.
	 *
	 * @param type LangChain message type.
	 * @returns Role name for telemetry.
	 */
	private mapMessageRole(type: string): string {
		const roleMap: Record<string, string> = {
			ai: "assistant",
			human: "user",
			system: "system",
			tool: "tool",
		};

		return roleMap[type] ?? type;
	}

	/**
	 * Extracts a normalized chat generation message when one exists.
	 *
	 * @param generation LangChain generation candidate.
	 * @returns Normalized generation message when present.
	 */
	private getGenerationMessage(
		generation: unknown,
	): NormalizedMessage | undefined {
		const message = this.getMessageLike(generation);

		if (!message) {
			return undefined;
		}

		const content = message.content;
		const type = this.getString(message, "type");

		if (typeof content !== "string" && !Array.isArray(content)) {
			return undefined;
		}

		return {
			content: typeof content === "string" ? content : JSON.stringify(content),
			role: this.mapMessageRole(type ?? "assistant"),
		};
	}

	/**
	 * Extracts a message-shaped value from a LangChain generation.
	 *
	 * @param generation LangChain generation candidate.
	 * @returns Message-shaped record when present.
	 */
	private getMessageLike(
		generation: unknown,
	): Record<string, unknown> | undefined {
		return this.getRecord(generation, "message");
	}

	/**
	 * Infers a provider name from serialized model metadata.
	 *
	 * @param llm Serialized LangChain model metadata.
	 * @param modelName Model name used for the request.
	 * @returns Provider name for GenAI attributes.
	 */
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

	/**
	 * Sets a span attribute when the value is OpenTelemetry-compatible.
	 *
	 * @param span Span receiving the attribute.
	 * @param key Attribute key.
	 * @param value Attribute value.
	 */
	private setAttributeIfSupported(
		span: Span,
		key: string,
		value: unknown,
	): void {
		const attributeValue = this.toAttributeValue(value);

		if (attributeValue !== undefined) {
			span.setAttribute(key, attributeValue);
		}
	}

	/**
	 * Emits a debug trace lifecycle log when debug mode is enabled.
	 *
	 * @param event Trace lifecycle event name.
	 * @param span Span associated with the lifecycle event.
	 * @param payload Additional event fields.
	 */
	private debugLog(
		event: "end" | "error" | "start" | "token",
		span: Span,
		payload: DebugLogPayload,
	): void {
		if (!this.debug) {
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

	/**
	 * Converts arbitrary values to supported OpenTelemetry attribute values.
	 *
	 * @param value Unknown source value.
	 * @returns OpenTelemetry attribute value when representable.
	 */
	private toAttributeValue(value: unknown): AttributeValue | undefined {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			return value;
		}

		if (Array.isArray(value)) {
			if (value.every((item) => typeof item === "string")) {
				return value;
			}

			if (value.every((item) => typeof item === "number")) {
				return value;
			}

			if (value.every((item) => typeof item === "boolean")) {
				return value;
			}

			return JSON.stringify(value);
		}

		if (value && typeof value === "object") {
			return JSON.stringify(value);
		}

		return undefined;
	}

	/**
	 * Reads an object-valued property from a record-like value.
	 *
	 * @param value Record-like source value.
	 * @param key Property key.
	 * @returns Nested record when present.
	 */
	private getRecord(
		value: unknown,
		key: string,
	): Record<string, unknown> | undefined {
		if (!value || typeof value !== "object") {
			return undefined;
		}

		const record = value as Record<string, unknown>;
		const result = record[key];

		return result && typeof result === "object" && !Array.isArray(result)
			? (result as Record<string, unknown>)
			: undefined;
	}

	/**
	 * Reads a string-valued property from a record-like value.
	 *
	 * @param value Record-like source value.
	 * @param key Property key.
	 * @returns String property when present.
	 */
	private getString(value: unknown, key: string): string | undefined {
		if (!value || typeof value !== "object") {
			return undefined;
		}

		const record = value as Record<string, unknown>;
		const result = record[key];

		return typeof result === "string" ? result : undefined;
	}

	/**
	 * Reads a number-valued property from a record-like value.
	 *
	 * @param value Record-like source value.
	 * @param key Property key.
	 * @returns Number property when present.
	 */
	private getNumber(value: unknown, key: string): number | undefined {
		if (!value || typeof value !== "object") {
			return undefined;
		}

		const record = value as Record<string, unknown>;
		const result = record[key];

		return typeof result === "number" ? result : undefined;
	}

	/**
	 * Normalizes unknown errors to Error instances.
	 *
	 * @param error Unknown error value.
	 * @returns Error instance.
	 */
	private toError(error: unknown): Error {
		return error instanceof Error ? error : new Error(String(error));
	}
}

/**
 * Registers a Moduna LangChain callback handler for all LangChain runs.
 *
 * @param handler Handler to register globally.
 */
export const registerGlobalModunaLangChainHandler = (
	handler: ModunaLangChainCallbackHandler,
): void => {
	if (!isConfigureHookRegistered) {
		registerConfigureHook({
			contextVar: MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY,
			inheritable: true,
		});
		isConfigureHookRegistered = true;
	}

	setContextVariable(MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY, handler);
};
