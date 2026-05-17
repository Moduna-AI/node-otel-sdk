import process, { loadEnvFile } from "node:process";
import ModunaOTEL from "../src/index.ts";

try {
    loadEnvFile();
} catch {
    // The test can also run with environment variables supplied by the shell.
}

const otel = await ModunaOTEL.start({
    serviceName: "moduna-langchain-test",
});

try {
    const result = await otel.traceGenAI(
        "langchain-test",
        "gpt-4.1-mini",
        "langchain",
        async (span) => {
            span.setAttribute("test.integration", "langchain");
            return "langchain-trace-complete";
        },
    );

    console.log(result);
} finally {
    await otel.shutdown();
}
