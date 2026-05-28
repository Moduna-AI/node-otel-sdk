import type { BaseMessage } from "@langchain/core/messages";
import { getRecord, getString } from "@/services/LangChainValueUtils.js";
import type { NormalizedMessage } from "@/services/ModunaLangChainTypes.js";

/**
 * Converts batches of LangChain messages to flat normalized messages.
 *
 * @param messageBatches LangChain message batches.
 * @returns Flat list of normalized prompt messages.
 */
export const normalizeMessageBatches = (
	messageBatches: BaseMessage[][],
): NormalizedMessage[] =>
	messageBatches.flatMap((messages) =>
		messages.map((message) => normalizeMessage(message)),
	);

/**
 * Converts a LangChain message to a GenAI-compatible role/content pair.
 *
 * @param message LangChain base message.
 * @returns Normalized message.
 */
export const normalizeMessage = (message: BaseMessage): NormalizedMessage => ({
	content:
		typeof message.content === "string"
			? message.content
			: JSON.stringify(message.content),
	role: mapMessageRole(message.type),
});

/**
 * Extracts a normalized chat generation message when one exists.
 *
 * @param generation LangChain generation candidate.
 * @returns Normalized generation message when present.
 */
export const getGenerationMessage = (
	generation: unknown,
): NormalizedMessage | undefined => {
	const message = getMessageLike(generation);

	if (!message) {
		return undefined;
	}

	const content = message.content;
	const type = getString(message, "type");

	if (typeof content !== "string" && !Array.isArray(content)) {
		return undefined;
	}

	return {
		content: typeof content === "string" ? content : JSON.stringify(content),
		role: mapMessageRole(type ?? "assistant"),
	};
};

/**
 * Extracts a message-shaped value from a LangChain generation.
 *
 * @param generation LangChain generation candidate.
 * @returns Message-shaped record when present.
 */
export const getMessageLike = (
	generation: unknown,
): Record<string, unknown> | undefined => getRecord(generation, "message");

/**
 * Converts LangChain message types to GenAI/OpenAI role names.
 *
 * @param type LangChain message type.
 * @returns Role name for telemetry.
 */
export const mapMessageRole = (type: string): string => {
	const roleMap: Record<string, string> = {
		ai: "assistant",
		human: "user",
		system: "system",
		tool: "tool",
	};

	return roleMap[type] ?? type;
};
