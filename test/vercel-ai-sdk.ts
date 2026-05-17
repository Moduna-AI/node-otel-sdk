import process, { loadEnvFile } from "node:process";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
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

const otel = await ModunaOTEL.start({
    agentName: "moduna-vercel-ai-sdk-test",
    sdkIntegration: "vercel_ai_sdk",
});

try {
    const result = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt: "Reply with exactly: moduna otel vercel ai sdk test",
        experimental_telemetry: {
            isEnabled: true,
        },
    });

    console.log(result.text);
} finally {
    await otel.shutdown();
}
