import { ModunaOTELSDKIntegration } from "@/types/SupportedSDK";

/**
 * Configuration options for the ModunaOTEL instance. This interface defines the shape of the configuration object that can be passed to the `start` method of ModunaOTEL. It includes options for specifying an API key for authentication, a custom service name for tracing, additional headers to include in trace exports, and the SDK integration to trace. If any of these options are not provided, ModunaOTEL will attempt to use environment variables or sensible defaults where applicable.
 * Example usage:
 * ```typescript
 * import ModunaOTEL from "@/services/ModunaOTEL";
 * 
 * async function main() {
 *     const otel = await ModunaOTEL.start({
 *         serviceName: "my-awesome-service",
 *         apiKey: "your-moduna-api-key",
 *         headers: {
 *             "X-Custom-Header": "value",
 *         },
 *         sdkIntegration: "langchain",
 *     });
 * 
 *     try {
 *         // Your application code here. All traces will be automatically captured and sent to Moduna.
 *         // You can also create manual spans if needed:
 *         const tracer = otel.getTracer();
 *         const span = tracer.startSpan("my-custom-span");
 *         span.setAttribute("custom.attribute", "value");
 *         span.end();
 *     } finally {
 *         await otel.shutdown();
 *     }
 * }
 * main();
 * ```
 */
export interface ModunaOTELConfig {
    apiKey?: string; // The API key for authenticating with the Moduna tracing backend. If not provided, it will attempt to read from the MODUNA_API_KEY environment variable.
    agentName: string;
    sdkIntegration: ModunaOTELSDKIntegration;
    headers?: Record<string, string>;
}
