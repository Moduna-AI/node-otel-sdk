import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import { describe, expect, it, vi } from "vitest";
import {
	ModunaLangChainCallbackHandler,
	registerGlobalModunaLangChainHandler,
} from "../src/index.ts";

const langChainMocks = vi.hoisted(() => {
	/**
	 * Minimal span double used to inspect LangChain callback telemetry.
	 */
	class MockSpan {
		/**
		 * Attributes written during a LangChain run.
		 */
		public readonly attributes = new Map<string, unknown>();

		/**
		 * Events added to the span.
		 */
		public readonly events: Array<{ attributes?: unknown; name: string }> = [];

		/**
		 * Exceptions captured from failed runs.
		 */
		public readonly exceptions: Error[] = [];

		/**
		 * Last status assigned to the span.
		 */
		public status?: { code: number; message?: string };

		/**
		 * Tracks whether the span was ended.
		 */
		public ended = false;

		/**
		 * Stores an OpenTelemetry-compatible span attribute.
		 *
		 * @param key Attribute name.
		 * @param value Attribute value.
		 */
		public setAttribute(key: string, value: unknown): this {
			this.attributes.set(key, value);
			return this;
		}

		/**
		 * Adds an event to the span.
		 *
		 * @param name Event name.
		 * @param attributes Optional event attributes.
		 */
		public addEvent(name: string, attributes?: unknown): this {
			this.events.push({ attributes, name });
			return this;
		}

		/**
		 * Records an exception for failed LangChain runs.
		 *
		 * @param error Normalized error instance.
		 */
		public recordException(error: Error): void {
			this.exceptions.push(error);
		}

		/**
		 * Stores the final OpenTelemetry span status.
		 *
		 * @param status Span status.
		 */
		public setStatus(status: { code: number; message?: string }): void {
			this.status = status;
		}

		/**
		 * Ends the span.
		 */
		public end(): void {
			this.ended = true;
		}

		/**
		 * Returns deterministic span identifiers for debug logging.
		 */
		public spanContext(): { spanId: string; traceId: string } {
			return {
				spanId: "span-id",
				traceId: "trace-id",
			};
		}
	}

	const spans: MockSpan[] = [];

	return {
		MockSpan,
		registerConfigureHook: vi.fn(),
		setContextVariable: vi.fn(),
		spans,
		startSpan: vi.fn((name: string): MockSpan => {
			const span = new MockSpan();
			spans.push(span);
			span.setAttribute("test.span.name", name);
			return span;
		}),
	};
});

vi.mock("@opentelemetry/api", () => ({
	SpanKind: {
		CLIENT: 2,
	},
	SpanStatusCode: {
		ERROR: 2,
		OK: 1,
	},
	trace: {
		getTracer: vi.fn(() => ({
			startSpan: langChainMocks.startSpan,
		})),
	},
}));

vi.mock("@langchain/core/context", () => ({
	registerConfigureHook: langChainMocks.registerConfigureHook,
	setContextVariable: langChainMocks.setContextVariable,
}));

/**
 * Creates serialized LangChain model metadata for tests.
 *
 * @returns Minimal serialized model record.
 */
const createSerializedModel = (): Serialized =>
	({
		id: ["langchain", "chat_models", "google_genai", "ChatGoogleGenerativeAI"],
		name: "ChatGoogleGenerativeAI",
	}) as unknown as Serialized;

/**
 * Creates a LangChain message-like value with a stable role and content.
 *
 * @param type LangChain message type.
 * @param content Message content.
 * @returns Message value accepted by the callback handler.
 */
const createMessage = (type: string, content: string): BaseMessage =>
	({
		content,
		type,
	}) as unknown as BaseMessage;

/**
 * Creates a minimal successful LangChain result with token metadata.
 *
 * @returns LLM result containing one assistant generation.
 */
const createLLMResult = (): LLMResult =>
	({
		generations: [
			[
				{
					message: {
						content: "Hello from Gemini",
						response_metadata: {
							model_name: "gemini-2.5-flash-lite",
						},
						type: "ai",
						usage_metadata: {
							input_tokens: 4,
							output_token_details: {
								reasoning: 1,
							},
							output_tokens: 3,
							total_tokens: 7,
						},
					},
					text: "Hello from Gemini",
				},
			],
		],
		llmOutput: {},
	}) as unknown as LLMResult;

describe("ModunaLangChainCallbackHandler", () => {
	it("captures chat model start metadata and trace context", () => {
		const handler = new ModunaLangChainCallbackHandler({
			traceContext: {
				conversationId: "default-conversation",
				sessionId: "default-session",
			},
		});

		handler.handleChatModelStart(
			createSerializedModel(),
			[[createMessage("human", "Hi there")]],
			"run-1",
			"parent-run",
			{
				invocation_params: {
					maxOutputTokens: 64,
					model: "gemini-2.5-flash-lite",
					temperature: 0,
				},
			},
			["moduna", "unit-test"],
			{
				conversationId: "conversation-langchain",
				sessionId: "session-langchain",
			},
			"Gemini Chat",
		);

		const span = langChainMocks.spans.at(-1);

		expect(span?.attributes.get("test.span.name")).toBe("Gemini Chat");
		expect(span?.attributes.get("moduna.framework")).toBe("langchain");
		expect(span?.attributes.get("sdk.integration")).toBe("langchain");
		expect(span?.attributes.get("langchain.run.id")).toBe("run-1");
		expect(span?.attributes.get("langchain.parent_run.id")).toBe("parent-run");
		expect(span?.attributes.get("gen_ai.operation.name")).toBe("chat");
		expect(span?.attributes.get("gen_ai.system")).toBe("google");
		expect(span?.attributes.get("gen_ai.request.model")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("gen_ai.request.max_tokens")).toBe(64);
		expect(span?.attributes.get("gen_ai.request.temperature")).toBe(0);
		expect(span?.attributes.get("moduna.conversation.id")).toBe(
			"conversation-langchain",
		);
		expect(span?.attributes.get("moduna.session.id")).toBe("session-langchain");
		expect(span?.attributes.get("gen_ai.prompt.0.role")).toBe("user");
		expect(span?.attributes.get("gen_ai.prompt.0.content")).toBe("Hi there");
		expect(span?.events.map((event) => event.name)).toContain(
			"gen_ai.content.prompt",
		);
	});

	it("applies completion and usage attributes when a run succeeds", () => {
		const handler = new ModunaLangChainCallbackHandler();

		handler.handleLLMStart(
			createSerializedModel(),
			["Summarize this"],
			"run-success",
			undefined,
			{
				invocation_params: {
					model_provider: "google",
					modelName: "gemini-2.5-flash-lite",
				},
			},
		);
		handler.handleLLMNewToken("Hello", undefined, "run-success");
		handler.handleLLMNewToken(" world", undefined, "run-success");
		handler.handleLLMEnd(createLLMResult(), "run-success");

		const span = langChainMocks.spans.at(-1);

		expect(span?.attributes.get("langchain.output.generations")).toBe(1);
		expect(span?.attributes.get("langchain.output.candidates")).toBe(1);
		expect(span?.attributes.get("gen_ai.completion.0.role")).toBe("assistant");
		expect(span?.attributes.get("gen_ai.completion.0.content")).toBe(
			"Hello from Gemini",
		);
		expect(span?.attributes.get("gen_ai.response.model")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("gen_ai.usage.input_tokens")).toBe(4);
		expect(span?.attributes.get("gen_ai.usage.output_tokens")).toBe(3);
		expect(span?.attributes.get("gen_ai.usage.total_tokens")).toBe(7);
		expect(span?.attributes.get("gen_ai.usage.details.reasoning_tokens")).toBe(
			1,
		);
		expect(span?.status).toEqual({ code: 1 });
		expect(span?.ended).toBe(true);
	});

	it("records errors and removes failed runs", () => {
		const handler = new ModunaLangChainCallbackHandler();
		const error = new Error("LangChain failed");

		handler.handleLLMStart(createSerializedModel(), ["Fail this"], "run-error");
		handler.handleLLMError(error, "run-error");

		const span = langChainMocks.spans.at(-1);

		expect(span?.exceptions).toContain(error);
		expect(span?.status).toEqual({
			code: 2,
			message: "LangChain failed",
		});
		expect(span?.ended).toBe(true);

		handler.handleLLMNewToken("ignored", undefined, "run-error");

		expect(span?.events).toHaveLength(1);
	});

	it("registers a global handler through LangChain context hooks", () => {
		const handler = new ModunaLangChainCallbackHandler();

		registerGlobalModunaLangChainHandler(handler);
		registerGlobalModunaLangChainHandler(handler);

		expect(langChainMocks.registerConfigureHook).toHaveBeenCalledTimes(1);
		expect(langChainMocks.setContextVariable).toHaveBeenCalledTimes(2);
		expect(langChainMocks.setContextVariable).toHaveBeenLastCalledWith(
			"moduna.otel.langchain.callbackHandler",
			handler,
		);
	});
});
