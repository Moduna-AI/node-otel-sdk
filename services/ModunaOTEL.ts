import process from "node:process";
import { SpanKind, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ModunaOTELConfig } from "../interface/ModunaOTELConfig.js";
import type { TraceCallback } from "../types/TraceCallback.js";
import type { ModunaOTELSDKIntegration } from "../types/SupportedSDK.js";

const DEFAULT_ENDPOINT =
    "https://volex-otel-git-506013021984.us-central1.run.app/v1/traces";

/**
 * ModunaOTEL is a wrapper around OpenTelemetry's NodeSDK that provides an easy way to integrate OpenTelemetry tracing into applications, with a focus on tracing interactions with Generative AI models. It allows developers to capture detailed telemetry data about their GenAI requests, including the model used and the SDK integration, without having to manually manage spans and attributes. The class also includes functionality to automatically detect the GenAI system based on the model name, making it easier to categorize and analyze traces in observability platforms.
 * To use ModunaOTEL, you typically start by calling the static `start` method to initialize the SDK, and then use the `traceGenAI` method to wrap any code that interacts with a GenAI model. This will automatically create spans with relevant attributes for each GenAI request, allowing you to gain insights into the performance and behavior of your GenAI interactions. Finally, you can call the `shutdown` method when your application is terminating to ensure that all telemetry data is properly flushed and resources are cleaned up.
 * Example usage:
 * ```typescript
 * import ModunaOTEL from "@/services/ModunaOTEL.ts";
 * 
 * async function main() {
 *     const otel = await ModunaOTEL.start({
 *         agentName: "my-gen-ai-service",
 *         sdkIntegration: "langchain",
 *     });
 * 
 *     try {
 *         const result = await otel.traceGenAI(
 *             "generate-text",
 *             "gpt-4",
 *             "langchain",
 *             async (span) => {
 *                 // Your code to call the GenAI model goes here.
 *                 // You can also set additional attributes on the span if needed.
 *                 span.setAttribute("custom.attribute", "value");
 *             }
 *         );
 *     } finally {
 *         await otel.shutdown();
 *     }
 * }
 * main();
 * ```
 */
export class ModunaOTEL {
    private readonly sdk: NodeSDK;
    private readonly sdkIntegration: ModunaOTELSDKIntegration;
    private started = false;

    /**
     * Creates a new instance of ModunaOTEL with the provided configuration. The constructor initializes the OpenTelemetry NodeSDK with an OTLP trace exporter configured to send traces to the specified endpoint, along with any additional headers (such as an API key for authentication). The service name is also set based on the configuration or defaults to "moduna-otel". Note that this constructor does not start the SDK; you must call the `start` method to begin capturing traces.
     * @param config Optional configuration for the ModunaOTEL instance, including API key, endpoint, service name, and additional headers. If not provided, it will use environment variables and defaults.
     */
    public constructor(config: ModunaOTELConfig) {
        this.sdkIntegration = config.sdkIntegration;
        const apiKey = config.apiKey ?? process.env.MODUNA_API_KEY;

        this.sdk = new NodeSDK({
            resource: resourceFromAttributes({
                [ATTR_SERVICE_NAME]: config.agentName,
            }),
            traceExporter: new OTLPTraceExporter({
                url: DEFAULT_ENDPOINT,
                headers: {
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                    ...config.headers,
                },
            }),
        });
    }

    /**
     * Starts the ModunaOTEL instance. This method must be called before using any tracing functionality. 
     * It is recommended to call this method as early as possible in the application lifecycle to ensure that all traces are captured.
     * @param config Optional configuration for the ModunaOTEL instance. If not provided, it will use environment variables and defaults.
     * @returns A promise that resolves to the started ModunaOTEL instance.
     */
    public static async start(config: ModunaOTELConfig): Promise<ModunaOTEL> {
        const otel = new ModunaOTEL(config);
        await otel.start();
        return otel;
    }

    public async start(): Promise<void> {
        if (this.started) {
            return;
        }

        this.sdk.start();
        this.started = true;
    }

    public async shutdown(): Promise<void> {
        if (!this.started) {
            return;
        }

        await this.sdk.shutdown();
        this.started = false;
    }

    public async instrument<T>(
        spanName: string,
        model: string,
        callback: TraceCallback<T>,
    ): Promise<T> {
        const tracer = trace.getTracer("moduna-gen-ai");

        return tracer.startActiveSpan(
            spanName,
            { kind: SpanKind.CLIENT },
            async (span) => {
                span.setAttribute("sdk.integration", this.sdkIntegration);
                span.setAttribute("gen_ai.request.model", model);

                try {
                    return await callback(span);
                } catch (error) {
                    span.recordException(error as Error);
                    throw error;
                } finally {
                    span.end();
                }
            },
        );
    }
}

export default ModunaOTEL;
