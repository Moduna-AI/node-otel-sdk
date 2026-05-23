# AGENTS.md

## Project Context
- Stack: TypeScript and OpenTelemetry.
- Goal: An OTEL SDK for Moduna.

## Critical Commands
- Build: `pnpm run build`
- Test: `pnpm test`
- Lint: `pnpm run lint`

## Coding Rules
- Prefer object-oriented design for SDK classes and services.
- Use arrow functions for lightweight helpers and callbacks.
- No default exports; use named exports only.
- Follow the directory structure in `/src/components`.
- Document every function and attribute clearly.
- Singleton instantiation.

## Moduna SDK
- Collects OpenTelemetry traces, logs, and metrics.
- Supports LangChain and Vercel AI SDK.
- Extremely easy to integrate into an existing codebase with just a single import and an instantiation.

## Supported Packages OTEL Docs
- LangChain - https://docs.langchain.com/langsmith/trace-with-opentelemetry
- Vercel AI SDK - https://ai-sdk.dev/docs/ai-sdk-core/telemetry
