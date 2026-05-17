# AGENTS.md

## Project Context
- Stack: TypeScript and open telemetry.
- Goal: An otel sdk for moduna.

## Critical Commands
- Build: `pnpm run build`
- Test: `pnpm test`
- Lint: `pnpm run lint`

## Coding Rules
- Use arrow functions for components.
- No default exports; use named exports only.
- Follow the directory structure in `/src/components`.
- Follow object oriented approach.
- Document every function and attribute clearly. 
- Singleton instantiation.

## Moduna SDK
- Collects otel traces, logs and metrics
- Supports langchain and vercel ai sdk
- Extremely easy to integrate into an existing codebase with just a single import and an instantiation.
