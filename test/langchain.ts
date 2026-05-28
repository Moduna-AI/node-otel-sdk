import process, { loadEnvFile } from "node:process";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { describe, expect, it, vi } from "vitest";
import {
	ModunaLangChainCallbackHandler,
	ModunaOTEL,
	registerGlobalModunaLangChainHandler,
} from "../src/index.ts";

try {
	loadEnvFile();
} catch {
	// The integration test can also run with environment variables from the shell.
}

const WEATHER_TOOL_NAME = "get_weather";

interface WeatherToolInput {
	/**
	 * City or region used for the weather lookup.
	 */
	location?: string;
}

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

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	/**
	 * OTLP exporter double that avoids sending Moduna telemetry during tests.
	 */
	OTLPTraceExporter: class OTLPTraceExporter {
		/**
		 * Reports a successful export result without opening a network connection.
		 *
		 * @param _spans Spans passed by the OpenTelemetry SDK.
		 * @param resultCallback Export completion callback.
		 */
		public export(
			_spans: unknown,
			resultCallback: (result: { code: number }) => void,
		): void {
			resultCallback({ code: 0 });
		}
	},
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn((attributes: Record<string, unknown>) => ({
		attributes,
	})),
}));

vi.mock("@opentelemetry/sdk-node", () => ({
	/**
	 * NodeSDK double that keeps Moduna SDK startup local to the test process.
	 */
	NodeSDK: class NodeSDK {
		/**
		 * Starts the SDK double without registering global OpenTelemetry providers.
		 */
		public start(): void {}

		/**
		 * Shuts down the SDK double without flushing exporters.
		 */
		public async shutdown(): Promise<void> {}
	},
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
	ATTR_SERVICE_NAME: "service.name",
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

/**
 * Reads a required span attribute from a captured test span.
 *
 * @param attributes Captured span attributes.
 * @param key Attribute name.
 * @returns Attribute value.
 */
const getRequiredAttribute = (
	attributes: Map<string, unknown>,
	key: string,
): unknown => {
	const value = attributes.get(key);

	expect(value, `Expected span attribute ${key}`).not.toBeUndefined();
	return value;
};

/**
 * Reads a required numeric span metric.
 *
 * @param attributes Captured span attributes.
 * @param key Metric attribute name.
 * @returns Metric value.
 */
const getRequiredNumberAttribute = (
	attributes: Map<string, unknown>,
	key: string,
): number => {
	const value = getRequiredAttribute(attributes, key);

	expect(value, `Expected numeric span attribute ${key}`).toEqual(
		expect.any(Number),
	);
	return value as number;
};

/**
 * Detects whether Vitest was launched with the verbose reporter.
 *
 * @returns True when the current Vitest process includes --reporter verbose.
 */
const isVerboseReporterEnabled = (): boolean =>
	process.argv.some(
		(argument, index, args) =>
			argument === "--verbose" ||
			argument === "--reporter=verbose" ||
			(argument === "--reporter" && args[index + 1] === "verbose"),
	) ||
	process.env.MODUNA_TEST_VERBOSE === "true" ||
	process.env.npm_config_verbose === "true" ||
	process.env.npm_lifecycle_script?.includes("--reporter verbose") === true ||
	process.env.npm_lifecycle_script?.includes("--reporter=verbose") === true ||
	process.env.npm_lifecycle_script?.includes("--verbose") === true ||
	process.env.npm_lifecycle_event?.endsWith(":verbose") === true;

/**
 * Prints span attributes only for verbose reporter runs.
 *
 * @param attributes Captured span attributes.
 */
const printAttributesForVerboseReporter = (
	attributes: Map<string, unknown>,
): void => {
	if (!isVerboseReporterEnabled()) {
		return;
	}

	console.info(
		"Captured LangChain span attributes:",
		JSON.stringify(Object.fromEntries(attributes), null, 2),
	);
};

/**
 * Returns deterministic weather information for a location.
 *
 * @param input Weather lookup arguments.
 * @returns Weather summary for the requested location.
 */
const getWeatherInfo = (input: WeatherToolInput): string => {
	const location = input.location ?? "unknown location";

	return `Weather for ${location}: 29 C, partly cloudy, humidity 72%, light breeze.`;
};

/**
 * Creates a deterministic weather tool for LangChain tool-call tests.
 *
 * @returns Structured weather lookup tool.
 */
const createWeatherTool = () =>
	tool(
		(input: WeatherToolInput): string => getWeatherInfo(input),
		{
			description: "Get current weather information for a particular location.",
			name: WEATHER_TOOL_NAME,
			schema: {
				additionalProperties: false,
				properties: {
					location: {
						description: "The city, region, or address to get weather for.",
						type: "string",
					},
				},
				required: ["location"],
				type: "object",
			},
		},
	);

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
					encodingFormats: ["text"],
					frequencyPenalty: 0.2,
					maxOutputTokens: 64,
					model: "gemini-2.5-flash-lite",
					presencePenalty: 0.1,
					seed: 123,
					stopSequences: ["END"],
					temperature: 0,
					toolArguments: { query: "moduna" },
					toolName: "search",
					tools: [{ name: "search" }],
					topK: 40,
					topP: 0.9,
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
		expect(span?.attributes.get("gen_ai.response.model")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("llm.model_name")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("metadata.ls_provider")).toBe("google");
		expect(span?.attributes.get("metadata.ls_model_name")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("langchain.serialized.id")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(span?.attributes.get("gen_ai.request.max_tokens")).toBe(64);
		expect(span?.attributes.get("gen_ai.request.temperature")).toBe(0);
		expect(span?.attributes.get("gen_ai.request.top_p")).toBe(0.9);
		expect(span?.attributes.get("gen_ai.request.top_k")).toBe(40);
		expect(span?.attributes.get("gen_ai.request.frequency_penalty")).toBe(0.2);
		expect(span?.attributes.get("gen_ai.request.presence_penalty")).toBe(0.1);
		expect(span?.attributes.get("gen_ai.request.seed")).toBe(123);
		expect(span?.attributes.get("gen_ai.request.stop_sequences")).toEqual([
			"END",
		]);
		expect(span?.attributes.get("gen_ai.request.encoding_formats")).toEqual([
			"text",
		]);
		expect(span?.attributes.get("tools")).toBe(
			JSON.stringify([{ name: "search" }]),
		);
		expect(span?.attributes.get("gen_ai.tool.name")).toBe("search");
		expect(span?.attributes.get("tool_arguments")).toBe(
			JSON.stringify({ query: "moduna" }),
		);
		expect(span?.attributes.get("moduna.conversation.id")).toBe(
			"conversation-langchain",
		);
		expect(span?.attributes.get("langsmith.metadata.conversation_id")).toBe(
			"conversation-langchain",
		);
		expect(span?.attributes.get("moduna.session.id")).toBe("session-langchain");
		expect(span?.attributes.get("langsmith.metadata.session_id")).toBe(
			"session-langchain",
		);
		expect(span?.attributes.get("langsmith.trace.session_id")).toBe(
			"session-langchain",
		);
		expect(span?.attributes.get("gen_ai.prompt")).toBe(
			JSON.stringify([{ content: "Hi there", role: "user" }]),
		);
		expect(span?.attributes.get("gen_ai.input.messages")).toBe(
			JSON.stringify([{ content: "Hi there", role: "user" }]),
		);
		expect(span?.attributes.get("gen_ai.prompt.0.role")).toBe("user");
		expect(span?.attributes.get("gen_ai.prompt.0.content")).toBe("Hi there");
		expect(span?.attributes.get("gen_ai.prompt.0.message.role")).toBe("user");
		expect(span?.attributes.get("gen_ai.prompt.0.message.content")).toBe(
			"Hi there",
		);
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
		expect(span?.attributes.get("gen_ai.completion.0.message.role")).toBe(
			"assistant",
		);
		expect(span?.attributes.get("gen_ai.completion.0.message.content")).toBe(
			"Hello from Gemini",
		);
		expect(span?.attributes.get("gen_ai.completion")).toBe(
			JSON.stringify([{ content: "Hello from Gemini", role: "assistant" }]),
		);
		expect(span?.attributes.get("gen_ai.response.model")).toBe(
			"gemini-2.5-flash-lite",
		);
		expect(span?.attributes.get("gen_ai.usage.input_tokens")).toBe(4);
		expect(span?.attributes.get("gen_ai.usage.prompt_tokens")).toBe(4);
		expect(span?.attributes.get("gen_ai.usage.output_tokens")).toBe(3);
		expect(span?.attributes.get("gen_ai.usage.completion_tokens")).toBe(3);
		expect(span?.attributes.get("gen_ai.usage.total_tokens")).toBe(7);
		expect(span?.attributes.get("gen_ai.usage.details.reasoning_tokens")).toBe(
			1,
		);
		expect(span?.status).toEqual({ code: 1 });
		expect(span?.ended).toBe(true);
	});

	it("maps direct LangChain reasoning tokens and infers usage totals", () => {
		const handler = new ModunaLangChainCallbackHandler();

		handler.handleLLMStart(
			createSerializedModel(),
			["Count this"],
			"run-usage",
		);
		handler.handleLLMEnd(
			{
				generations: [
					[
						{
							message: {
								content: "Done",
								type: "ai",
								usage_metadata: {
									input_tokens: 5,
									output_tokens: 2,
									reasoning_tokens: 1,
								},
							},
							text: "Done",
						},
					],
				],
				llmOutput: {},
			} as unknown as LLMResult,
			"run-usage",
		);

		const span = langChainMocks.spans.at(-1);

		expect(span?.attributes.get("gen_ai.usage.input_tokens")).toBe(5);
		expect(span?.attributes.get("gen_ai.usage.output_tokens")).toBe(2);
		expect(span?.attributes.get("gen_ai.usage.total_tokens")).toBe(7);
		expect(span?.attributes.get("gen_ai.usage.details.reasoning_tokens")).toBe(
			1,
		);
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

	it("captures a real Google LangChain request and response through the SDK handler", async () => {
		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

		if (!apiKey) {
			throw new Error(
				"Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable.",
			);
		}

		const otel = new ModunaOTEL({
			agentName: "moduna-langchain-google-vitest",
			autoShutdown: false,
			framework: "langchain",
		});
		const handler = otel.langChainHandler({
			conversationId: "conversation-real-langchain-google",
			sessionId: "session-real-langchain-google",
		});
		const llm = new ChatGoogleGenerativeAI({
			apiKey,
			maxOutputTokens: 64,
			model: "gemini-2.5-flash-lite",
			temperature: 0,
		});

		const response = await llm.invoke("this is a test", {
			callbacks: [handler],
			metadata: {
				conversationId: "conversation-real-langchain-google",
				sessionId: "session-real-langchain-google",
			},
		});
		const span = langChainMocks.spans.at(-1);
		const responseText =
			typeof response.content === "string"
				? response.content
				: JSON.stringify(response.content);
		const attributes = span?.attributes;
		const promptMessages = JSON.stringify([
			{ content: "this is a test", role: "user" },
		]);
		const completionMessages = JSON.stringify([
			{ content: responseText, role: "assistant" },
		]);

		expect(responseText.trim().length).toBeGreaterThan(0);
		expect(attributes).toBeDefined();

		if (!attributes) {
			throw new Error("Expected the real LangChain call to create a span.");
		}

		printAttributesForVerboseReporter(attributes);

		expect(attributes.get("test.span.name")).toBe("langchain.llm");
		expect(attributes.get("moduna.framework")).toBe("langchain");
		expect(attributes.get("sdk.integration")).toBe("langchain");
		expect(getRequiredAttribute(attributes, "langchain.run.id")).toEqual(
			expect.any(String),
		);
		expect(attributes.get("langchain.run.type")).toBe("chat_model");
		expect(attributes.get("langchain.input.count")).toBe(1);
		expect(attributes.get("langsmith.span.kind")).toBe("llm");
		expect(attributes.get("gen_ai.operation.name")).toBe("chat");
		expect(attributes.get("llm.request.type")).toBe("chat");
		expect(attributes.get("gen_ai.system")).toBe("google");
		expect(attributes.get("gen_ai.request.model")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(attributes.get("gen_ai.response.model")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(attributes.get("llm.model_name")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(attributes.get("metadata.ls_provider")).toBe("google");
		expect(attributes.get("metadata.ls_model_name")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(attributes.get("langchain.serialized.id")).toBe(
			"langchain.chat_models.google_genai.ChatGoogleGenerativeAI",
		);
		expect(attributes.get("llm.invocation_parameters")).toBe("{}");
		expect(attributes.get("moduna.conversation.id")).toBe(
			"conversation-real-langchain-google",
		);
		expect(attributes.get("langsmith.metadata.conversation_id")).toBe(
			"conversation-real-langchain-google",
		);
		expect(attributes.get("moduna.session.id")).toBe(
			"session-real-langchain-google",
		);
		expect(attributes.get("langsmith.metadata.session_id")).toBe(
			"session-real-langchain-google",
		);
		expect(attributes.get("langsmith.trace.session_id")).toBe(
			"session-real-langchain-google",
		);
		expect(attributes.get("gen_ai.prompt")).toBe(promptMessages);
		expect(attributes.get("gen_ai.input.messages")).toBe(promptMessages);
		expect(attributes.get("gen_ai.prompt.0.role")).toBe("user");
		expect(attributes.get("gen_ai.prompt.0.content")).toBe("this is a test");
		expect(attributes.get("gen_ai.prompt.0.message.role")).toBe("user");
		expect(attributes.get("gen_ai.prompt.0.message.content")).toBe(
			"this is a test",
		);
		expect(attributes.get("langchain.output.generations")).toBe(1);
		expect(attributes.get("langchain.output.candidates")).toBe(1);
		expect(attributes.get("gen_ai.completion")).toBe(completionMessages);
		expect(attributes.get("gen_ai.output.messages")).toBe(completionMessages);
		expect(attributes.get("gen_ai.completion.0.role")).toBe("assistant");
		expect(attributes.get("gen_ai.completion.0.content")).toBe(responseText);
		expect(attributes.get("gen_ai.completion.0.message.role")).toBe(
			"assistant",
		);
		expect(attributes.get("gen_ai.completion.0.message.content")).toBe(
			responseText,
		);

		const inputTokens = getRequiredNumberAttribute(
			attributes,
			"gen_ai.usage.input_tokens",
		);
		const outputTokens = getRequiredNumberAttribute(
			attributes,
			"gen_ai.usage.output_tokens",
		);
		const totalTokens = getRequiredNumberAttribute(
			attributes,
			"gen_ai.usage.total_tokens",
		);

		expect(inputTokens).toBeGreaterThan(0);
		expect(outputTokens).toBeGreaterThan(0);
		expect(totalTokens).toBe(inputTokens + outputTokens);
		expect(attributes.get("gen_ai.usage.prompt_tokens")).toBe(inputTokens);
		expect(attributes.get("llm.token_count.prompt")).toBe(inputTokens);
		expect(attributes.get("gen_ai.usage.completion_tokens")).toBe(outputTokens);
		expect(attributes.get("llm.token_count.completion")).toBe(outputTokens);
		expect(attributes.get("llm.token_count.total")).toBe(totalTokens);
		expect(attributes.get("llm.usage.total_tokens")).toBe(totalTokens);
		expect(span.events.map((event) => event.name)).toEqual(
			expect.arrayContaining([
				"gen_ai.content.prompt",
				"gen_ai.content.completion",
			]),
		);
		expect(span.status).toEqual({ code: 1 });
		expect(span.ended).toBe(true);

		await otel.shutdown();
	}, 60_000);

	it("captures a real Google LangChain weather tool call through the SDK handler", async () => {
		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

		if (!apiKey) {
			throw new Error(
				"Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable.",
			);
		}

		const otel = new ModunaOTEL({
			agentName: "moduna-langchain-google-tool-vitest",
			autoShutdown: false,
			framework: "langchain",
		});
		const handler = otel.langChainHandler({
			conversationId: "conversation-real-langchain-weather-tool",
			sessionId: "session-real-langchain-weather-tool",
		});
		const weatherTool = createWeatherTool();
		const llm = new ChatGoogleGenerativeAI({
			apiKey,
			maxOutputTokens: 64,
			model: "gemini-2.5-flash-lite",
			temperature: 0,
		});
		const llmWithWeatherTool = llm.bindTools([weatherTool], {
			allowedFunctionNames: [WEATHER_TOOL_NAME],
		});

		const response = await llmWithWeatherTool.invoke(
			"Use the get_weather tool to get weather information for Chennai, India.",
			{
				callbacks: [handler],
				metadata: {
					conversationId: "conversation-real-langchain-weather-tool",
					sessionId: "session-real-langchain-weather-tool",
				},
			},
		);
		const toolCall = response.tool_calls?.find(
			(call) => call.name === WEATHER_TOOL_NAME,
		);
		const span = langChainMocks.spans.at(-1);
		const attributes = span?.attributes;

		expect(toolCall).toBeDefined();

		if (!toolCall) {
			throw new Error("Expected Google to return a get_weather tool call.");
		}

		const weatherResult = getWeatherInfo(toolCall.args as WeatherToolInput);

		expect(weatherResult).toContain("Weather for");
		expect(weatherResult).toContain("Chennai");
		expect(attributes).toBeDefined();

		if (!attributes) {
			throw new Error("Expected the weather tool call to create a span.");
		}

		printAttributesForVerboseReporter(attributes);

		expect(attributes.get("moduna.framework")).toBe("langchain");
		expect(attributes.get("sdk.integration")).toBe("langchain");
		expect(attributes.get("gen_ai.system")).toBe("google");
		expect(attributes.get("gen_ai.operation.name")).toBe("chat");
		expect(attributes.get("llm.request.type")).toBe("chat");
		expect(attributes.get("moduna.conversation.id")).toBe(
			"conversation-real-langchain-weather-tool",
		);
		expect(attributes.get("moduna.session.id")).toBe(
			"session-real-langchain-weather-tool",
		);
		expect(attributes.get("gen_ai.prompt.0.content")).toBe(
			"Use the get_weather tool to get weather information for Chennai, India.",
		);
		expect(attributes.get("tools")).toContain(WEATHER_TOOL_NAME);
		expect(attributes.get("llm.invocation_parameters")).toContain(
			WEATHER_TOOL_NAME,
		);
		expect(attributes.get("langchain.output.generations")).toBe(1);
		expect(attributes.get("langchain.output.candidates")).toBe(1);
		expect(attributes.get("gen_ai.completion.0.role")).toBe("assistant");
		expect(attributes.get("gen_ai.completion")).toContain(WEATHER_TOOL_NAME);
		expect(span?.status).toEqual({ code: 1 });
		expect(span?.ended).toBe(true);

		await otel.shutdown();
	}, 60_000);
});
