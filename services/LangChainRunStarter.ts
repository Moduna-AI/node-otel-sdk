import type { Span } from "@opentelemetry/api";
import { SpanKind, trace } from "@opentelemetry/api";
import type { LangChainSpanAttributes } from "@/services/LangChainSpanAttributes.js";
import type {
	ActiveLangChainRun,
	StartLangChainRunInput,
} from "@/services/ModunaLangChainTypes.js";

/**
 * Starts LangChain spans and applies request-side attributes.
 */
export class LangChainRunStarter {
	/**
	 * Creates a run starter.
	 *
	 * @param spanAttributes Attribute applier for LangChain spans.
	 */
	public constructor(
		private readonly spanAttributes: LangChainSpanAttributes,
	) {}

	/**
	 * Starts a LangChain run span.
	 *
	 * @param input LangChain run input collected from callbacks.
	 * @returns Active run state for later token/end/error callbacks.
	 */
	public startRun(input: StartLangChainRunInput): ActiveLangChainRun {
		const span = trace
			.getTracer("moduna-langchain")
			.startSpan(input.runName ?? "langchain.llm", {
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

		this.applyOptionalRunAttributes(span, input);
		this.spanAttributes.applyModelAttributes(
			span,
			input.llm,
			input.extraParams,
		);
		this.spanAttributes.applyPromptAttributes(span, input.inputMessages);
		this.spanAttributes.applyInvocationAttributes(span, input.extraParams);
		this.spanAttributes.applyTraceContext(span, input.metadata);

		return {
			runType: input.runType,
			span,
			streamedTokenCount: 0,
		};
	}

	private applyOptionalRunAttributes(
		span: Span,
		input: StartLangChainRunInput,
	): void {
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
	}
}
