# @moduna/otel

OpenTelemetry setup for Moduna AI traces in Node.js apps, including Vercel AI SDK and direct Gemini calls.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set the Moduna key using either a shell or a `.env` file:

   ```bash
   export MODUNA_API_KEY="your-moduna-key"
   ```

   or create a `.env` file with:

   ```env
   MODUNA_API_KEY=your-moduna-key
   ```

## Two-line integration

```ts
import ModunaOTEL from "@moduna/otel";
const otel = await ModunaOTEL.start({ serviceName: "my-ai-app" });
```

Use `experimental_telemetry: { isEnabled: true }` with the Vercel AI SDK after startup. For direct Gemini calls, wrap the request with `otel.traceGemini(...)`.

## Development

Format, lint, or build with:

   ```bash
   pnpm exec biome format
   pnpm exec biome lint
   pnpm build
   ```
