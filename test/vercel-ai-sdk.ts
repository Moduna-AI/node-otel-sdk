import process, { loadEnvFile } from "node:process";
import { google } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
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
    agentName: "moduna-vercel-ai-sdk-test",
    framework: "vercel-ai-sdk",
});

try {
    const generated = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt: "Hi there! This is a test",
        experimental_telemetry: otel.vercelTelemetry({
            conversationId: "conversation-generate-text",
            sessionId: "session-vercel-ai-sdk-test",
        }),
    });

    console.log(generated.text);

    const streamed = streamText({
        model: google("gemini-2.5-flash-lite"),
        prompt: "Stream exactly: moduna otel vercel ai sdk stream test",
        experimental_telemetry: otel.vercelTelemetry({
            conversationId: "conversation-stream-text",
            sessionId: "session-vercel-ai-sdk-test",
        }),
    });

    for await (const textPart of streamed.textStream) {
        process.stdout.write(textPart);
    }

    process.stdout.write("\n");
} finally {
    await otel.shutdown();
}
