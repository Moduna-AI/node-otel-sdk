import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { registerConfigureHook, setContextVariable } from "@langchain/core/context";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import type { ModunaTraceContext } from "../types/TraceContext.js";

const MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY =
    "moduna.otel.langchain.callbackHandler";

let isConfigureHookRegistered = false;

/**
 * Configuration for Moduna's LangChain callback handler.
 */
export interface ModunaLangChainCallbackHandlerConfig {
    /**
     * Default trace identifiers used when a LangChain call has no metadata.
     */
    traceContext?: ModunaTraceContext;
}

interface ActiveLangChainRun {
    /**
     * OpenTelemetry span for the LangChain run.
     */
    span: Span;
}

/**
 * LangChain callback handler that emits Moduna OpenTelemetry spans.
 */
export class ModunaLangChainCallbackHandler extends BaseCallbackHandler {
    /**
     * Stable handler name used by LangChain callback manager de-duplication.
     */
    public name = "moduna_otel_langchain_callback_handler";

    private readonly defaultTraceContext: ModunaTraceContext;

    private readonly runs = new Map<string, ActiveLangChainRun>();

    /**
     * Creates a LangChain callback handler for Moduna spans.
     *
     * @param config Optional default trace identifiers.
     */
    public constructor(config: ModunaLangChainCallbackHandlerConfig = {}) {
        super();
        this.defaultTraceContext = config.traceContext ?? {};
    }

    /**
     * Starts a span for a LangChain chat model run.
     *
     * @param llm Serialized LangChain model metadata.
     * @param messages Messages sent to the chat model.
     * @param runId LangChain run identifier.
     * @param parentRunId Parent run identifier, when present.
     * @param extraParams Provider-specific run parameters.
     * @param tags LangChain run tags.
     * @param metadata LangChain run metadata.
     * @param runName LangChain run name.
     */
    public handleChatModelStart(
        llm: Serialized,
        messages: BaseMessage[][],
        runId: string,
        parentRunId?: string,
        extraParams?: Record<string, unknown>,
        tags?: string[],
        metadata?: Record<string, unknown>,
        runName?: string,
    ): void {
        this.startRun({
            extraParams,
            inputCount: messages.length,
            llm,
            metadata,
            parentRunId,
            runId,
            runName,
            runType: "chat_model",
            tags,
        });
    }

    /**
     * Starts a span for a LangChain LLM run.
     *
     * @param llm Serialized LangChain model metadata.
     * @param prompts Prompts sent to the LLM.
     * @param runId LangChain run identifier.
     * @param parentRunId Parent run identifier, when present.
     * @param extraParams Provider-specific run parameters.
     * @param tags LangChain run tags.
     * @param metadata LangChain run metadata.
     * @param runName LangChain run name.
     */
    public handleLLMStart(
        llm: Serialized,
        prompts: string[],
        runId: string,
        parentRunId?: string,
        extraParams?: Record<string, unknown>,
        tags?: string[],
        metadata?: Record<string, unknown>,
        runName?: string,
    ): void {
        this.startRun({
            extraParams,
            inputCount: prompts.length,
            llm,
            metadata,
            parentRunId,
            runId,
            runName,
            runType: "llm",
            tags,
        });
    }

    /**
     * Records a streamed token count signal on the active LangChain span.
     *
     * @param _token New token emitted by LangChain.
     * @param _idx Token indices from LangChain.
     * @param runId LangChain run identifier.
     */
    public handleLLMNewToken(
        _token: string,
        _idx: unknown,
        runId: string,
    ): void {
        this.runs.get(runId)?.span.addEvent("langchain.llm.token");
    }

    /**
     * Ends the span for a successful LangChain run.
     *
     * @param output LangChain LLM output.
     * @param runId LangChain run identifier.
     */
    public handleLLMEnd(output: LLMResult, runId: string): void {
        const run = this.runs.get(runId);

        if (!run) {
            return;
        }

        run.span.setAttribute(
            "langchain.output.generations",
            output.generations.length,
        );
        run.span.setStatus({ code: SpanStatusCode.OK });
        run.span.end();
        this.runs.delete(runId);
    }

    /**
     * Records an error and ends the span for a failed LangChain run.
     *
     * @param error Error emitted by LangChain.
     * @param runId LangChain run identifier.
     */
    public handleLLMError(error: unknown, runId: string): void {
        const run = this.runs.get(runId);

        if (!run) {
            return;
        }

        run.span.recordException(this.toError(error));
        run.span.setStatus({
            code: SpanStatusCode.ERROR,
            message: this.toError(error).message,
        });
        run.span.end();
        this.runs.delete(runId);
    }

    private startRun(input: {
        extraParams?: Record<string, unknown>;
        inputCount: number;
        llm: Serialized;
        metadata?: Record<string, unknown>;
        parentRunId?: string;
        runId: string;
        runName?: string;
        runType: "chat_model" | "llm";
        tags?: string[];
    }): void {
        const tracer = trace.getTracer("moduna-langchain");
        const span = tracer.startSpan(input.runName ?? "langchain.llm", {
            kind: SpanKind.CLIENT,
        });

        span.setAttribute("moduna.framework", "langchain");
        span.setAttribute("sdk.integration", "langchain");
        span.setAttribute("langchain.run.id", input.runId);
        span.setAttribute("langchain.run.type", input.runType);
        span.setAttribute("langchain.input.count", input.inputCount);

        if (input.parentRunId) {
            span.setAttribute("langchain.parent_run.id", input.parentRunId);
        }

        if (input.tags?.length) {
            span.setAttribute("langchain.tags", input.tags.join(","));
        }

        this.applyModelAttributes(span, input.llm, input.extraParams);
        this.applyTraceContext(span, input.metadata);
        this.runs.set(input.runId, { span });
    }

    private applyModelAttributes(
        span: Span,
        llm: Serialized,
        extraParams?: Record<string, unknown>,
    ): void {
        const modelName =
            this.getString(extraParams?.invocation_params, "model") ??
            this.getString(extraParams?.invocation_params, "modelName") ??
            this.getString(llm, "name") ??
            llm.id.join(".");

        span.setAttribute("gen_ai.system", "google");
        span.setAttribute("gen_ai.request.model", modelName);
        span.setAttribute("langchain.serialized.id", llm.id.join("."));
    }

    private applyTraceContext(
        span: Span,
        metadata?: Record<string, unknown>,
    ): void {
        const traceContext = {
            conversationId:
                this.getString(metadata, "conversationId") ??
                this.getString(metadata, "moduna.conversation.id") ??
                this.defaultTraceContext.conversationId,
            sessionId:
                this.getString(metadata, "sessionId") ??
                this.getString(metadata, "moduna.session.id") ??
                this.defaultTraceContext.sessionId,
        };

        if (traceContext.conversationId) {
            span.setAttribute(
                "moduna.conversation.id",
                traceContext.conversationId,
            );
        }

        if (traceContext.sessionId) {
            span.setAttribute("moduna.session.id", traceContext.sessionId);
        }
    }

    private getString(value: unknown, key: string): string | undefined {
        if (!value || typeof value !== "object") {
            return undefined;
        }

        const record = value as Record<string, unknown>;
        const result = record[key];

        return typeof result === "string" ? result : undefined;
    }

    private toError(error: unknown): Error {
        return error instanceof Error ? error : new Error(String(error));
    }
}

/**
 * Registers a Moduna LangChain callback handler for all LangChain runs.
 *
 * @param handler Handler to register globally.
 */
export const registerGlobalModunaLangChainHandler = (
    handler: ModunaLangChainCallbackHandler,
): void => {
    if (!isConfigureHookRegistered) {
        registerConfigureHook({
            contextVar: MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY,
            inheritable: true,
        });
        isConfigureHookRegistered = true;
    }

    setContextVariable(MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY, handler);
};
