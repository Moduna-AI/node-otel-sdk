import type { Span } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import { ModunaOTEL } from "../src/index.js";

const telemetryMocks = vi.hoisted(() => {
	/**
	 * Minimal OpenTelemetry span double used to observe SDK instrumentation.
	 */
	class MockSpan {
		/**
		 * Attributes written to the span during instrumentation.
		 */
		public readonly attributes = new Map<string, unknown>();

		/**
		 * Error values recorded on the span.
		 */
		public readonly exceptions: unknown[] = [];

		/**
		 * Tracks whether the span has been ended.
		 */
		public ended = false;

		/**
		 * Stores a single OpenTelemetry-compatible attribute.
		 *
		 * @param key Attribute name.
		 * @param value Attribute value.
		 */
		public setAttribute(key: string, value: unknown): this {
			this.attributes.set(key, value);
			return this;
		}

		/**
		 * Records an exception raised inside an instrumented callback.
		 *
		 * @param error Error or unknown thrown value.
		 */
		public recordException(error: unknown): void {
			this.exceptions.push(error);
		}

		/**
		 * Ends the span.
		 */
		public end(): void {
			this.ended = true;
		}
	}

	const spans: MockSpan[] = [];

	return {
		MockSpan,
		spans,
		startActiveSpan: vi.fn(
			async <T>(
				name: string,
				_options: unknown,
				callback: (span: MockSpan) => Promise<T> | T,
			): Promise<T> => {
				const span = new MockSpan();
				spans.push(span);
				span.setAttribute("test.span.name", name);
				return callback(span);
			},
		),
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
			startActiveSpan: telemetryMocks.startActiveSpan,
			startSpan: vi.fn(),
		})),
	},
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	/**
	 * Test exporter double that keeps constructor behavior side-effect free.
	 */
	OTLPTraceExporter: class OTLPTraceExporter {
		/**
		 * Reports successful exports to match the OpenTelemetry exporter contract.
		 *
		 * @param _spans Spans passed by the SDK.
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
	 * NodeSDK double that makes singleton startup observable and local-only.
	 */
	NodeSDK: class NodeSDK {
		/**
		 * Starts the test SDK without registering real OpenTelemetry providers.
		 */
		public start(): void {}

		/**
		 * Shuts down the test SDK without flushing network exporters.
		 */
		public async shutdown(): Promise<void> {}
	},
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
	ATTR_SERVICE_NAME: "service.name",
}));

describe("ModunaOTEL Vercel AI SDK telemetry", () => {
	it("creates Vercel AI SDK telemetry metadata from trace context", () => {
		const otel = new ModunaOTEL({
			agentName: "vercel-test-agent",
			autoShutdown: false,
			framework: "vercel-ai-sdk",
		});

		const telemetry = otel.vercelTelemetry({
			conversationId: "conversation-123",
			sessionId: "session-456",
		});

		expect(telemetry).toEqual({
			isEnabled: true,
			metadata: {
				"moduna.conversation.id": "conversation-123",
				"moduna.session.id": "session-456",
			},
		});
	});

	it("runs callbacks inside a Vercel instrumentation span", async () => {
		const otel = new ModunaOTEL({
			agentName: "vercel-test-agent",
			autoShutdown: false,
			framework: "vercel-ai-sdk",
		});

		const result = await otel.instrument(
			"vercel.generateText",
			{
				conversationId: "conversation-generate",
				sessionId: "session-vercel",
			},
			(span: Span) => {
				span.setAttribute("ai.prompt", "hello");
				return "generated text";
			},
		);

		const span = telemetryMocks.spans.at(-1);

		expect(result).toBe("generated text");
		expect(span?.attributes.get("test.span.name")).toBe("vercel.generateText");
		expect(span?.attributes.get("moduna.framework")).toBe("vercel-ai-sdk");
		expect(span?.attributes.get("sdk.integration")).toBe("vercel-ai-sdk");
		expect(span?.attributes.get("moduna.conversation.id")).toBe(
			"conversation-generate",
		);
		expect(span?.attributes.get("moduna.session.id")).toBe("session-vercel");
		expect(span?.attributes.get("ai.prompt")).toBe("hello");
		expect(span?.ended).toBe(true);
	});

	it("records thrown callback errors before rethrowing", async () => {
		const otel = new ModunaOTEL({
			agentName: "vercel-test-agent",
			autoShutdown: false,
			framework: "vercel-ai-sdk",
		});
		const failure = new Error("model call failed");

		await expect(
			otel.instrument("vercel.generateText", () => {
				throw failure;
			}),
		).rejects.toThrow(failure);

		const span = telemetryMocks.spans.at(-1);

		expect(span?.exceptions).toContain(failure);
		expect(span?.ended).toBe(true);
	});
});
