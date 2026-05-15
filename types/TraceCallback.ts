import type { Span } from "@opentelemetry/api";

export type TraceCallback<T> = (span: Span) => Promise<T> | T;
