import type { LLMResult } from "@langchain/core/outputs";
import type { Span } from "@opentelemetry/api";
import { getGenerationMessage } from "@/services/LangChainMessageNormalizer.js";
import { LangChainUsageExtractor } from "@/services/LangChainUsageExtractor.js";
import type { NormalizedMessage } from "@/services/ModunaLangChainTypes.js";

/**
 * Applies LangChain completion and token usage attributes to spans.
 */
export class LangChainOutputAttributes {
	private readonly usageExtractor = new LangChainUsageExtractor();

	/**
	 * Applies model completion output attributes from a LangChain result.
	 *
	 * @param span Span receiving completion attributes.
	 * @param output LangChain LLM output.
	 */
	public applyCompletionAttributes(span: Span, output: LLMResult): void {
		const messages: NormalizedMessage[] = [];

		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = getGenerationMessage(generation);
				messages.push(
					message ?? { content: generation.text, role: "assistant" },
				);
			}
		}

		for (const [index, message] of messages.entries()) {
			span.setAttribute(`gen_ai.completion.${index}.role`, message.role);
			span.setAttribute(`gen_ai.completion.${index}.content`, message.content);
			span.setAttribute(
				`gen_ai.completion.${index}.message.role`,
				message.role,
			);
			span.setAttribute(
				`gen_ai.completion.${index}.message.content`,
				message.content,
			);
		}

		if (messages.length > 0) {
			span.setAttribute("gen_ai.completion", JSON.stringify(messages));
			span.setAttribute("gen_ai.output.messages", JSON.stringify(messages));
			span.addEvent("gen_ai.content.completion", {
				content: JSON.stringify(messages),
			});
		}

		const responseModel = this.usageExtractor.getResponseModel(output);

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
	public applyUsageAttributes(
		span: Span,
		output: LLMResult,
		streamedTokenCount: number,
	): void {
		const usage = this.usageExtractor.extractUsage(output);
		const completionTokens =
			usage.completionTokens ??
			(streamedTokenCount > 0 ? streamedTokenCount : undefined);
		const totalTokens =
			usage.totalTokens ??
			(usage.promptTokens !== undefined && completionTokens !== undefined
				? usage.promptTokens + completionTokens
				: undefined);

		if (usage.promptTokens !== undefined) {
			span.setAttribute("gen_ai.usage.input_tokens", usage.promptTokens);
			span.setAttribute("gen_ai.usage.prompt_tokens", usage.promptTokens);
			span.setAttribute("llm.token_count.prompt", usage.promptTokens);
		}

		if (completionTokens !== undefined) {
			span.setAttribute("gen_ai.usage.output_tokens", completionTokens);
			span.setAttribute("gen_ai.usage.completion_tokens", completionTokens);
			span.setAttribute("llm.token_count.completion", completionTokens);
		}

		if (totalTokens !== undefined) {
			span.setAttribute("gen_ai.usage.total_tokens", totalTokens);
			span.setAttribute("llm.token_count.total", totalTokens);
			span.setAttribute("llm.usage.total_tokens", totalTokens);
		}

		if (usage.reasoningTokens !== undefined) {
			span.setAttribute(
				"gen_ai.usage.details.reasoning_tokens",
				usage.reasoningTokens,
			);
		}
	}

	/**
	 * Extracts token usage from a LangChain result.
	 *
	 * @param output LangChain LLM output.
	 * @returns Normalized token usage when present.
	 */
	public extractUsage(output: LLMResult) {
		return this.usageExtractor.extractUsage(output);
	}

	/**
	 * Counts all generated candidates in a LangChain result.
	 *
	 * @param output LangChain LLM output.
	 * @returns Total generation candidate count.
	 */
	public countGenerations(output: LLMResult): number {
		return this.usageExtractor.countGenerations(output);
	}
}
