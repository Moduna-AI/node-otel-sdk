import process from "node:process";
import { SpanKind, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ModunaOTELConfig } from "../interface/ModunaOTELConfig.js";
import type { TraceCallback } from "../types/TraceCallback.js";

export type ModunaOTELSDKIntegration = "langchain" | "vercel-ai-sdk";

const DEFAULT_ENDPOINT =
    "https://volex-otel-git-506013021984.us-central1.run.app/v1/traces";
const DEFAULT_SERVICE_NAME = "moduna-otel";

export class ModunaOTEL {
    private readonly sdk: NodeSDK;
    private started = false;

    public constructor(config: ModunaOTELConfig = {}) {
        const apiKey = config.apiKey ?? process.env.MODUNA_API_KEY;

        this.sdk = new NodeSDK({
            resource: resourceFromAttributes({
                [ATTR_SERVICE_NAME]: config.serviceName ?? DEFAULT_SERVICE_NAME,
            }),
            traceExporter: new OTLPTraceExporter({
                url: config.endpoint ?? DEFAULT_ENDPOINT,
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
    public static async start(config: ModunaOTELConfig = {}): Promise<ModunaOTEL> {
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

    private static detectGenAISystem(model: string): string {
        const normalized = model.toLowerCase();

        if (normalized.includes("gemini")) {
            return "google.gemini";
        }

        if (normalized.includes("claude") || normalized.includes("anthropic")) {
            return "anthropic.claude";
        }

        if (
            normalized.includes("gpt") ||
            normalized.includes("openai") ||
            normalized.includes("chat")
        ) {
            return "openai.chat";
        }

        if (normalized.includes("azure")) {
            return "azure.openai";
        }

        return "unknown";
    }

    public async traceGenAI<T>(
        spanName: string,
        model: string,
        sdkIntegration: ModunaOTELSDKIntegration,
        callback: TraceCallback<T>,
        system?: string,
    ): Promise<T> {
        const tracer = trace.getTracer("moduna-gen-ai");
        const genAiSystem = system ?? ModunaOTEL.detectGenAISystem(model);

        return tracer.startActiveSpan(
            spanName,
            { kind: SpanKind.CLIENT },
            async (span) => {
                span.setAttribute("sdk.integration", sdkIntegration);
                span.setAttribute("gen_ai.system", genAiSystem);
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

    public async traceGemini<T>(
        spanName: string,
        model: string,
        sdkIntegration: ModunaOTELSDKIntegration,
        callback: TraceCallback<T>,
    ): Promise<T> {
        return this.traceGenAI(spanName, model, sdkIntegration, callback, "google.gemini");
    }
}

export default ModunaOTEL;
