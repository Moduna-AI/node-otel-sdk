import "dotenv/config";
import OpenAI from "openai";
import process from "node:process";

const apiKey = process.env.MODUNA_API_KEY;
const proxyUrl = process.env.MODUNA_BASE_URI ?? "http://127.0.0.1:8080/v1";

if (!apiKey) {
    throw new Error("Missing MODUNA_API_KEY environment variable.");
}

const client = new OpenAI({
    apiKey,
    baseURL: proxyUrl,
});

async function main() {
    const response = await client.chat.completions.create(
        {
            model: "gemini-2.5-flash-lite",
            messages: [
                {
                    role: "user",
                    content: "What is the capital of USA?",
                },
            ],
        },
        {
            headers: {
                "X-Request-ID": "cli-gemini-telemetry-test",
            },
        }
    );

    console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
    console.error("Request failed:", error);
    process.exit(1);
});
