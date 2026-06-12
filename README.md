# `@moduna/otel`

Strictly typed Moduna SDK for collecting OpenTelemetry traces from GenAI applications through OpenLLMetry-compatible runtimes.

[![CI](https://github.com/moduna-ai/moduna-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/moduna-ai/moduna-typescript/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@moduna/otel.svg)](https://www.npmjs.com/package/@moduna/otel)
[![npm downloads](https://img.shields.io/npm/dm/%40moduna%2Fotel.svg)](https://www.npmjs.com/package/@moduna/otel)
[![CI](https://github.com/Moduna-AI/node-otel-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Moduna-AI/node-otel-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40moduna%2Fotel.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-enabled-425cc7.svg)](https://opentelemetry.io/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-f69220.svg)](https://pnpm.io/)
[![GitHub stars](https://img.shields.io/github/stars/Moduna-AI/node-otel-sdk.svg?style=social)](https://github.com/Moduna-AI/node-otel-sdk/stargazers)

## Getting Started

```ts
import { moduna } from '@moduna/otel'

await moduna.initialize({ appName: 'customer-support' })
await moduna.withConversation('sess-124', async () => {})
```

```bash
export MODUNA_API_KEY=mod_live_...
```

## Installation

```bash
pnpm add @moduna/otel
npm install @moduna/otel
bun add @moduna/otel
```

If you want Moduna to bootstrap the underlying OpenLLMetry integration automatically, install the Traceloop Node SDK alongside it:

```bash
pnpm add @traceloop/node-server-sdk
```

## Configuration

`@moduna/otel` resolves configuration in this order:

1. Inline options passed to `initialize`
2. Environment variables
3. SDK defaults

Supported environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `MODUNA_API_KEY` | Moduna API key | Required |
| `MODUNA_BASE_URL` | Collector base URL override | `https://volex-506013021984.asia-south1.run.app` |

### Inline API Key

```ts
import { moduna } from '@moduna/otel'

await moduna.initialize({
  appName: 'customer-support',
  apiKey: 'mod_live_...'
})
```

### Base URL Override

```bash
export MODUNA_BASE_URL='http://localhost:4318'
```

### Conversation Helpers

```ts
import { moduna } from '@moduna/otel'

await moduna.initialize({ appName: 'customer-support' })

await moduna.withConversation(async () => {
  // Moduna will generate a ULID conversation ID automatically
})
```

```ts
class SupportAgent {
  @moduna.conversation('sess-123')
  async handleMessage(userMessage: string): Promise<string> {
    return `Handled: ${userMessage}`
  }
}
```

## Supported Frameworks

| Framework | Status | Notes |
| --- | --- | --- |
| OpenLLMetry / Traceloop Node SDK | Supported now | Optional peer dependency used as the tracing bridge |
| LangChain | Planned | Will be exposed as a dedicated package later |
| LangGraph | Planned | Will be exposed as a dedicated package later |
| Agno | Planned | Planned adapter package |
| LiteLLM | Planned | Planned adapter package |
| LlamaIndex | Planned | Planned adapter package |

## Public API

```ts
import {
  MODUNA_DEFAULT_BASE_URL,
  ModunaConfigurationError,
  createModunaSdk,
  moduna
} from '@moduna/otel'
```

- `moduna.initialize(options)` validates configuration and boots the optional tracing bridge
- `moduna.withConversation(task)` creates a generated ULID conversation scope
- `moduna.withConversation(conversationId, task)` runs work inside an explicit conversation scope
- `moduna.conversation()` and `moduna.conversation(conversationId)` decorate async methods
- `createModunaSdk()` creates an isolated SDK instance for testing or embedding

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

API reference generation:

```bash
pnpm docs:api
```

## Testing

Vitest covers:

- configuration precedence and validation
- collector base URL defaults and overrides
- automatic ULID conversation generation
- decorator and `withConversation` wrappers
- domain fixtures for customer support, ecommerce, and IT service agent scenarios

Live provider-dependent tests are opt-in and only run when both `GOOGLE_API_KEY` and `MODUNA_API_KEY` are present.

```bash
pnpm test:e2e
```

The end-to-end test loads `.env`, calls Gemini 2.5 Flash, records the LLM call inside a
Moduna conversation, and flushes the trace to the configured collector.

## Contributing

1. Keep the public API strictly typed.
2. Add public types under `src/types`.
3. Prefer explicit named exports over default exports.
4. Document exported APIs with JSDoc.

## License

Apache-2.0
