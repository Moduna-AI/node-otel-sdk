import type { TelemetrySettings } from "ai";
import { describe, expectTypeOf, it } from "vitest";
import type {
	ModunaLangChainCallbackHandler,
	ModunaOTEL,
	ModunaOTELConfig,
	ModunaTraceContext,
	ModunaVercelTelemetrySettings,
} from "../src/index.js";

/**
 * Extracts the resolved value type from sync or async callbacks.
 */
type AwaitedCallbackResult<TCallback extends (...args: never[]) => unknown> =
	Awaited<ReturnType<TCallback>>;

/**
 * Type-level assertion that two types are exactly assignable to one another.
 */
type AssertEqual<TActual, TExpected> = [TActual] extends [TExpected]
	? [TExpected] extends [TActual]
		? true
		: false
	: false;

/**
 * Captures the inferred result for a sync instrument callback.
 *
 * @param otel SDK instance used only for compile-time inference.
 * @returns Promise-wrapped callback result.
 */
const createSyncInstrumentResult = (otel: ModunaOTEL) =>
	otel.instrument("sync-operation", () => 42);

/**
 * Captures the inferred result for an async instrument callback with context.
 *
 * @param otel SDK instance used only for compile-time inference.
 * @returns Promise-wrapped async callback result.
 */
const createAsyncInstrumentResult = (otel: ModunaOTEL) =>
	otel.instrument(
		"async-operation",
		{
			conversationId: "conversation-typed",
		},
		async () => ({
			ok: true as const,
		}),
	);

describe("Moduna public types", () => {
	it("accepts strongly typed configuration and trace context objects", () => {
		const config = {
			agentName: "type-test",
			framework: "vercel-ai-sdk",
		} satisfies ModunaOTELConfig;
		const legacyConfig = {
			agentName: "legacy-type-test",
			sdkIntegration: "langchain",
		} satisfies ModunaOTELConfig;
		const context = {
			conversationId: "conversation-123",
			sessionId: "session-456",
		} satisfies ModunaTraceContext;

		expectTypeOf(config.framework).toEqualTypeOf<"vercel-ai-sdk">();
		expectTypeOf(legacyConfig.sdkIntegration).toEqualTypeOf<"langchain">();
		expectTypeOf(context).toMatchTypeOf<ModunaTraceContext>();
	});

	it("preserves Vercel and LangChain integration return types", () => {
		expectTypeOf<
			ReturnType<ModunaOTEL["vercelTelemetry"]>
		>().toEqualTypeOf<ModunaVercelTelemetrySettings>();
		expectTypeOf<
			ReturnType<ModunaOTEL["vercelTelemetry"]>
		>().toMatchTypeOf<TelemetrySettings>();
		expectTypeOf<
			ReturnType<ModunaOTEL["langChainHandler"]>
		>().toEqualTypeOf<ModunaLangChainCallbackHandler>();
		expectTypeOf<
			InstanceType<typeof ModunaLangChainCallbackHandler>
		>().toEqualTypeOf<ModunaLangChainCallbackHandler>();
	});

	it("infers instrument callback results through the generic overloads", () => {
		expectTypeOf<ReturnType<typeof createSyncInstrumentResult>>().toEqualTypeOf<
			Promise<number>
		>();
		expectTypeOf<
			ReturnType<typeof createAsyncInstrumentResult>
		>().toEqualTypeOf<Promise<{ ok: true }>>();
		expectTypeOf<
			AssertEqual<
				AwaitedCallbackResult<() => Promise<{ ok: true }>>,
				{ ok: true }
			>
		>().toEqualTypeOf<true>();
	});
});

const invalidFrameworkConfig = {
	agentName: "type-test",
	framework: "vercel_ai_sdk",
} satisfies ModunaOTELConfig;

const invalidLegacyConfig = {
	agentName: "type-test",
	sdkIntegration: "openai",
} satisfies ModunaOTELConfig;

void invalidFrameworkConfig;
void invalidLegacyConfig;
