import type { LLMResult } from "@langchain/core/outputs";
import { getMessageLike } from "@/services/LangChainMessageNormalizer.js";
import {
	getNumber,
	getRecord,
	getString,
} from "@/services/LangChainValueUtils.js";
import type { TokenUsage } from "@/services/ModunaLangChainTypes.js";

/**
 * Extracts token usage and response metadata from LangChain results.
 */
export class LangChainUsageExtractor {
	/**
	 * Extracts token usage from LangChain result metadata and provider outputs.
	 *
	 * @param output LangChain LLM output.
	 * @returns Normalized token usage when present.
	 */
	public extractUsage(output: LLMResult): TokenUsage {
		const usageMetadata = this.getFirstUsageMetadata(output);
		const tokenUsage = getRecord(output.llmOutput, "tokenUsage");
		const estimatedTokenUsage = getRecord(
			output.llmOutput,
			"estimatedTokenUsage",
		);

		return {
			completionTokens:
				getNumber(usageMetadata, "output_tokens") ??
				getNumber(tokenUsage, "completionTokens") ??
				getNumber(tokenUsage, "completion_tokens") ??
				getNumber(estimatedTokenUsage, "completionTokens"),
			promptTokens:
				getNumber(usageMetadata, "input_tokens") ??
				getNumber(tokenUsage, "promptTokens") ??
				getNumber(tokenUsage, "prompt_tokens") ??
				getNumber(estimatedTokenUsage, "promptTokens"),
			reasoningTokens:
				getNumber(usageMetadata, "reasoning_tokens") ??
				getNumber(
					getRecord(usageMetadata, "output_token_details"),
					"reasoning",
				),
			totalTokens:
				getNumber(usageMetadata, "total_tokens") ??
				getNumber(tokenUsage, "totalTokens") ??
				getNumber(tokenUsage, "total_tokens") ??
				getNumber(estimatedTokenUsage, "totalTokens"),
		};
	}

	/**
	 * Finds the model name returned by the provider, when available.
	 *
	 * @param output LangChain LLM output.
	 * @returns Provider response model name when present.
	 */
	public getResponseModel(output: LLMResult): string | undefined {
		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = getMessageLike(generation);
				const responseMetadata = getRecord(message, "response_metadata");
				const model =
					getString(responseMetadata, "model_name") ??
					getString(responseMetadata, "model") ??
					getString(output.llmOutput, "model");

				if (model) {
					return model;
				}
			}
		}

		return getString(output.llmOutput, "model");
	}

	/**
	 * Counts all generated candidates in a LangChain result.
	 *
	 * @param output LangChain LLM output.
	 * @returns Total generation candidate count.
	 */
	public countGenerations(output: LLMResult): number {
		return output.generations.reduce(
			(count, generationGroup) => count + generationGroup.length,
			0,
		);
	}

	private getFirstUsageMetadata(
		output: LLMResult,
	): Record<string, unknown> | undefined {
		for (const generationGroup of output.generations) {
			for (const generation of generationGroup) {
				const message = getMessageLike(generation);
				const usageMetadata = getRecord(message, "usage_metadata");

				if (usageMetadata) {
					return usageMetadata;
				}
			}
		}

		return undefined;
	}
}
