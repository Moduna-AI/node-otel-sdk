---
name: moduna sdk
description: Project manager with engineering expertise
---

# AGENSTS.md

Moduna SDK that wraps around OpenLLMetry SDK to collect OTEL traces from genai applications. Supports multiple angent frameworks and llm sdks. Keep the project and export Moduna sdk strictly typed. Use the `typescript-advanced-types` and `typescript-docs` skill for stictly typing and documenting this project.

---

## Project Structure

- **types/**: All user defined or exported types goes into this folder.
- **services/**: Services that are used in the SDK workflow or feature.
- **utils/**: Utility function or classes that is used across the project.
- **types/contant.ts**: Add the moduna OTEL collect url. The traces are send to this endpoint.
- **tests/{agent_name}**: Add tests for each agent. Each agent will have it's own set of tools for testing tool calling.

---

## Setup

- `pnpm lint`: linting check
- `pnpm run`: Run the SDK for local development
- `pnpm build`: Build the project
- `pnpm test`: Test the project

---

## Tools and Packages

List of tools, packages and frameworks used in this project.

### Core Packages

- OpenLLMetry: https://github.com/traceloop/openllmetry-js/blob/main/README.md

### Test

- Vitest: For testing the SDK.

---

## Ergonomics

A really important part of this project. This encompasses developer experience and journey with Moduna. 

### Installation

Add support for installation with only required dependencies. Based on what framework the user requests. Only install the required dependencies for each installed mode. Support `pnpm`, `npm` and `bun`.

- `pnpm install @moduna`: Install frameworks and support tracing for all the frameworks. Not recommended, but, an option.
- `pnpm install @moduna/langchain`: Support langchain and install langchain core dependencies based on openllmetry.
- `pnpm install @moduna/crewai`: Support crewai core dependencies to ceollect otel traces.
- `pnpm install @moduna/agno`: Support agno core dependencies to collect otel traces.
- `pnpm install @moduna/langgraph`: Support langgraph core dependencies to collect otel traces.
- `pnpm install @moduna/litellm`: Support collecting LiteLLM otel traces.
- `pnpm install @moduna/llmaindex`: Support collecting llama index traces.

### Export From OpenLLMetry

Function and types directly exported from openllmetry. Wrapped around moduna sdk to reflect brand and ergonomics.

- `withConversation()`: Set a new conversation id.
- `conversation()`: Set a new conversation id via decorator.

### Getting Started

Should be user friendly and preferably within 5 lines of code to intergrate into an existing project.

```ts
import moduna from "@moduna/langchain"
moduna.initialize({
    "app_name":"customer-support"
});
await moduna.withConversation("sess-124", async () => { ... });
```

```bash
export MODUNA_API_KEY=mod_live_...
```

With other parameters

```ts
import moduna from "@moduna/langchain"
moduna.initialize({
    apikey: "mod_live_...",
    app_name: "customer-support"
});
await moduna.withConversation("sess-124", async () => { ... });
```

Supported base url override via exported variable or `.env`

```bash
export MODUNA_BASE_URL="http://localhost:4318"
```

### With decorator

```ts
@moduna.conversation("sess-123")
async handleMessage(userMessage: string) { ... }
```

---

## Sessions

Group traces from multi-turn conversations into a single view using a **conversation ID**.

### What are Sessions?
Sessions let you link related traces across a multi-turn conversation. The Traceloop UI groups them so you can see the full conversation flow and inspect individual spans. Use a **consistent, unique ID** (e.g. a UUID) for all turns of the same conversation.


### TypeScript

**Using the decorator:**
```ts
@traceloop.conversation("session-123")
async handleMessage(userMessage: string) { ... }
```

**Using `withConversation`:**
```ts
await traceloop.withConversation("session-123", async () => { ... });
```

**Using `conversationId` in workflow config:**
```ts
await traceloop.withWorkflow(
  { name: "chat_interaction", conversationId: "session-123" },
  async () => { ... }
);
```

### Auto conversation ID

Moduna SDK supports auto session id. Session are created using ULID for choronologically sorting the conversations/session based on conversation id. A utility function auto generates a converation id whenever the decorator or `withConversation` fucntion is invoked. This removes the hassle for developers to write their own functions. 

---

## Publishing

The repository is public. Use Github CI/CD and publish it to npm. Add github workflow.

---

## Error

Explicitly throw an error if `MODUNA_API_KEY` is not set. Explicity guide the user to how to set it. Either `export` or `.env` file.

---

## Documentation

- Add Getting started, supported frameworks as table and import module info and contribution and Development section to `README.md`
- Add docs to functions, types and classes that is supported via code editors.

---

## Code Style

- **Strictness**: Enable and adhere to TypeScript `strict` mode. Never use `any`—use `unknown` or explicit types.
- **Formatting**: Enforced by Prettier. Use 2 spaces for indentation, single quotes, and no semicolons.
- **Naming**: Use `camelCase` for functions/variables, `PascalCase` for types/interfaces/classes, and `UPPER_CASE` for constants.
- **Exports**: Prefer explicit named exports over default exports. Avoid star (`export *`) exports.
- **Paradigms**: Prefer functional patterns, immutable data variables (`const`), and pure functions where possible.
- **Data Validation**: Always validate external payloads (API responses/JSON) using schemas (e.g., Zod).

### Code Examples

```typescript
// Good: Explicit types, named export, immutable, no semicolons, single quotes
export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'user'
}

export const formatUser = (user: UserProfile): string => {
  return `${user.email} (${user.role})`
}

// Bad: Implicit any, default export, semicolons, double quotes, mutable let
let profile = { id: 1, email: "test@test.com" }; 
export default function (p) { return p.email; };
```

---

## Testing

Test run using `vitest`. Support upto 10 tools to test tool calling traces. Use google genai llm gemini-2.5-flash for testing.

- Cutomer Support agent
- e-commer agents
- it service agent