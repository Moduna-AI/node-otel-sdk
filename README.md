# OpenAI Proxy Example

This project demonstrates sending a chat completion request through a local proxy endpoint.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set the proxy endpoint and key using either a shell or a `.env` file:

   ```bash
   export VOLEX_VIRTUAL_KEY="your-virtual-key"
   export OPENAI_PROXY_URL="http://127.0.0.1:8080/v1"
   ```

   or create a `.env` file with:

   ```env
   VOLEX_VIRTUAL_KEY=your-virtual-key
   OPENAI_PROXY_URL=http://127.0.0.1:8080/v1
   ```

3. Format or lint with Biome:

   ```bash
   pnpm exec biome format
   pnpm exec biome lint
   ```

4. Run the example:

   ```bash
   pnpm start
   ```
