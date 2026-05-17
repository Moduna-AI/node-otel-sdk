import process, { loadEnvFile } from "node:process";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import ModunaOTEL from "../src/index.ts";

try {
    loadEnvFile();
} catch {
    // The test can also run with environment variables supplied by the shell.
}

const requiredEnvVars = ["GOOGLE_GENERATIVE_AI_API_KEY", "MODUNA_API_KEY"] as const;

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing ${envVar} environment variable.`);
    }
}

const otel = new ModunaOTEL({
    agentName: "moduna-langchain-gemini-test",
    framework: "langchain",
});
const handler = otel.langChainHandler();

const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    maxOutputTokens: 64,
    model: "gemini-2.5-flash-lite",
    temperature: 0,
});

try {
    const callbackResponse = await llm.invoke(
        "Reply with exactly: moduna otel langchain gemini callback test",
        {
            callbacks: [handler],
            metadata: {
                conversationId: "conversation-langchain-callback",
                sessionId: "session-langchain-test",
            },
        },
    );

    console.log(callbackResponse.text);

    otel.registerGlobalLangChainHandler();

    const globalResponse = await llm.invoke(
        "Reply with exactly: moduna otel langchain gemini global test",
        {
            metadata: {
                conversationId: "conversation-langchain-global",
                sessionId: "session-langchain-test",
            },
        },
    );

    console.log(globalResponse.text);

    const manualResponse = await otel.instrument(
        "langchain-gemini-manual-invoke",
        {
            conversationId: "conversation-langchain-gemini",
            sessionId: "session-langchain-test",
        },
        async () =>
            llm.invoke("Reply with exactly: moduna otel langchain gemini test"),
    );

    console.log(manualResponse.text);
} finally {
    await otel.shutdown();
}
