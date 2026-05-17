# @moduna/otel

[![npm version](https://img.shields.io/npm/v/%40moduna%2Fotel.svg)](https://www.npmjs.com/package/@moduna/otel)
[![npm downloads](https://img.shields.io/npm/dm/%40moduna%2Fotel.svg)](https://www.npmjs.com/package/@moduna/otel)
[![CI](https://github.com/Moduna-AI/node-otel-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Moduna-AI/node-otel-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40moduna%2Fotel.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-enabled-425cc7.svg)](https://opentelemetry.io/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-f69220.svg)](https://pnpm.io/)
[![GitHub stars](https://img.shields.io/github/stars/Moduna-AI/node-otel-sdk.svg?style=social)](https://github.com/Moduna-AI/node-otel-sdk/stargazers)

OpenTelemetry setup for Moduna AI traces in Node.js apps, including Vercel AI SDK and LangChain.

## Project Health

| Metric | Status |
| --- | --- |
| Package | [`@moduna/otel`](https://www.npmjs.com/package/@moduna/otel) |
| Runtime | Node.js ESM |
| Types | TypeScript declarations included |
| License | MIT |
| Package managers | npm, pnpm, bun |
| Frameworks | Vercel AI SDK, LangChain |
| Telemetry | OpenTelemetry traces |

## Release Workflow

This package uses GitHub Actions and Changesets for CI, changelog updates, versioning, and publishing.

1. Create a changeset for user-facing changes:

   ```bash
   pnpm changeset
   ```

2. Merge the feature PR. The release workflow opens a version PR with `CHANGELOG.md` and `package.json` updates.

3. Merge the version PR. The release workflow publishes the package to npm.

The release workflow requires an `NPM_TOKEN` repository secret with permission to publish `@moduna/otel`.

## Install

```bash
npm install @moduna/otel
pnpm add @moduna/otel
bun add @moduna/otel
```

## Setup

Set the Moduna key using either a shell or a `.env` file:

```bash
export MODUNA_API_KEY="your-moduna-key"
```

or create a `.env` file with:

```env
MODUNA_API_KEY=your-moduna-key
```

## One-line integration

```ts
import ModunaOTEL from "@moduna/otel";

const otel = new ModunaOTEL({
    agentName: "my-ai-app",
    framework: "vercel-ai-sdk",
});
```

## Framework Usage

Choose the framework you are using with Moduna OTEL.

<details open>
<summary><strong>Vercel AI SDK</strong></summary>

Pass per-call conversation or session identifiers to `generateText` and `streamText`.

```ts
const result = await generateText({
    model,
    prompt,
    experimental_telemetry: otel.vercelTelemetry({
        conversationId: "conversation-123",
        sessionId: "session-456",
    }),
});
```

The IDs are attached to the generated spans as Moduna telemetry metadata.

</details>

<details>
<summary><strong>LangChain</strong></summary>

Use Moduna as a LangChain callback handler.

```ts
import ModunaOTEL from "@moduna/otel";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const otel = new ModunaOTEL({
    agentName: "my-ai-app",
    framework: "langchain",
});
const handler = otel.langChainHandler();
const model = new ChatGoogleGenerativeAI({ model: "gemini-1.5-pro" });

const result = await model.invoke("Hello, world!", {
    callbacks: [handler],
    metadata: {
        conversationId: "conversation-123",
        sessionId: "session-456",
    },
});
```

Or register it globally for all LangChain runs.

```ts
otel.registerGlobalLangChainHandler();

const result = await model.invoke("Hello, world!", {
    metadata: {
        conversationId: "conversation-123",
        sessionId: "session-456",
    },
});
```

</details>

## Development

Format, lint, or build with:

```bash
pnpm run build
pnpm run lint
pnpm test
```
