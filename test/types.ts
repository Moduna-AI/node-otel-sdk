import type { TelemetrySettings } from "ai";
import ModunaOTEL, {
    ModunaLangChainCallbackHandler,
    type ModunaOTELConfig,
    type ModunaTraceContext,
} from "../src/index.ts";

const config = {
    agentName: "type-test",
    framework: "vercel-ai-sdk",
} satisfies ModunaOTELConfig;

const otel = new ModunaOTEL(config);

const context = {
    conversationId: "conversation-123",
    sessionId: "session-456",
} satisfies ModunaTraceContext;

const telemetry: TelemetrySettings = otel.vercelTelemetry(context);
const langChainHandler = otel.langChainHandler(context);
const debugLangChainHandler = otel.langChainHandler(context, { debug: true });
const exportedHandler = new ModunaLangChainCallbackHandler({
    debug: true,
    traceContext: context,
});

void telemetry;
void langChainHandler;
void debugLangChainHandler;
void exportedHandler;

// @ts-expect-error framework names are intentionally constrained.
new ModunaOTEL({ agentName: "type-test", framework: "vercel_ai_sdk" });
