import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import { SpanStatusCode } from "@opentelemetry/api";
import { LangChainDebugLogger } from "@/services/LangChainDebugLogger.js";
import { normalizeMessageBatches } from "@/services/LangChainMessageNormalizer.js";
import { LangChainOutputAttributes } from "@/services/LangChainOutputAttributes.js";
import { LangChainRunStarter } from "@/services/LangChainRunStarter.js";
import { LangChainSpanAttributes } from "@/services/LangChainSpanAttributes.js";
import { toError } from "@/services/LangChainValueUtils.js";
import type {
	ActiveLangChainRun,
	ModunaLangChainCallbackHandlerConfig,
	StartLangChainRunInput,
} from "@/services/ModunaLangChainTypes.js";

export { registerGlobalModunaLangChainHandler } from "@/services/ModunaLangChainGlobalRegistry.js";
export type { ModunaLangChainCallbackHandlerConfig } from "@/services/ModunaLangChainTypes.js";

/**
 * LangChain callback handler that emits Moduna OpenTelemetry spans.
 */
export class ModunaLangChainCallbackHandler extends BaseCallbackHandler {
	/** Stable handler name used by LangChain callback manager de-duplication. */
	public name = "moduna_otel_langchain_callback_handler";

	private readonly debugLogger: LangChainDebugLogger;

	private readonly outputAttributes = new LangChainOutputAttributes();

	private readonly runs = new Map<string, ActiveLangChainRun>();

	private readonly runStarter: LangChainRunStarter;

	/**
	 * Creates a LangChain callback handler for Moduna spans.
	 *
	 * @param config Optional default trace identifiers.
	 */
	public constructor(config: ModunaLangChainCallbackHandlerConfig = {}) {
		super();
		this.debugLogger = new LangChainDebugLogger(
			config.debug ?? false,
			config.logger ?? console,
		);
		this.runStarter = new LangChainRunStarter(
			new LangChainSpanAttributes(config.traceContext ?? {}),
		);
	}

	/** Starts a span for a LangChain chat model run. */
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
			inputMessages: normalizeMessageBatches(messages),
			llm,
			metadata,
			parentRunId,
			runId,
			runName,
			runType: "chat_model",
			tags,
		});
	}

	/** Starts a span for a LangChain LLM run. */
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

	/** Records a streamed token count signal on the active LangChain span. */
	public handleLLMNewToken(token: string, _idx: unknown, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}

		run.streamedTokenCount += 1;
		run.span.addEvent("gen_ai.content.completion", {
			content: token,
			role: "assistant",
		});
		this.debugLogger.log("token", run.span, {
			runId,
			runType: run.runType,
			streamedTokenCount: run.streamedTokenCount,
			tokenLength: token.length,
		});
	}

	/** Ends the span for a successful LangChain run. */
	public handleLLMEnd(output: LLMResult, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}
		const candidateCount = this.outputAttributes.countGenerations(output);

		run.span.setAttribute(
			"langchain.output.generations",
			output.generations.length,
		);
		run.span.setAttribute("langchain.output.candidates", candidateCount);
		this.outputAttributes.applyCompletionAttributes(run.span, output);
		this.outputAttributes.applyUsageAttributes(
			run.span,
			output,
			run.streamedTokenCount,
		);
		this.debugLogger.log("end", run.span, {
			candidateCount,
			generationCount: output.generations.length,
			runId,
			runType: run.runType,
			streamedTokenCount: run.streamedTokenCount,
			usage: this.outputAttributes.extractUsage(output),
		});
		run.span.setStatus({ code: SpanStatusCode.OK });
		run.span.end();
		this.runs.delete(runId);
	}

	/** Records an error and ends the span for a failed LangChain run. */
	public handleLLMError(error: unknown, runId: string): void {
		const run = this.runs.get(runId);

		if (!run) {
			return;
		}

		const normalizedError = toError(error);

		run.span.recordException(normalizedError);
		run.span.setStatus({
			code: SpanStatusCode.ERROR,
			message: normalizedError.message,
		});
		this.debugLogger.log("error", run.span, {
			errorName: normalizedError.name,
			errorMessage: normalizedError.message,
			runId,
			runType: run.runType,
		});
		run.span.end();
		this.runs.delete(runId);
	}

	private startRun(input: StartLangChainRunInput): void {
		const run = this.runStarter.startRun(input);

		this.runs.set(input.runId, run);
		this.debugLogger.log("start", run.span, {
			inputCount: input.inputCount,
			parentRunId: input.parentRunId,
			runId: input.runId,
			runName: input.runName,
			runType: input.runType,
			tags: input.tags,
		});
	}
}
