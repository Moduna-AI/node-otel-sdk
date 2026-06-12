import { loadEnvFile } from 'node:process'

import { describe, expect, it } from 'vitest'

import { createModunaSdk } from '../src/index.js'

try {
  loadEnvFile('.env')
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('ENOENT')) {
    throw error
  }
}

const hasLiveProviderConfig =
  process.env.RUN_E2E === '1' &&
  Boolean(process.env.GOOGLE_API_KEY) &&
  Boolean(process.env.MODUNA_API_KEY)

describe('live provider integration', () => {
  it.skipIf(!hasLiveProviderConfig)(
    'sends a LangChain Gemini 2.5 Flash conversation trace to the Moduna collector',
    async () => {
      const googleApiKey = process.env.GOOGLE_API_KEY

      if (!googleApiKey) {
        throw new Error('GOOGLE_API_KEY is required for the live provider test.')
      }

      const sdk = createModunaSdk()
      const config = await sdk.initialize({
        appName: 'moduna-sdk-e2e',
        metadata: {
          testType: 'e2e',
          provider: 'google',
        },
      })
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')

      const conversationId = `e2e-${Date.now()}`
      const prompt = 'Reply with exactly: MODUNA_E2E_OK'
      const model = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey,
        model: 'gemini-2.5-flash',
        temperature: 0,
        maxOutputTokens: 128,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      })

      console.log(`Moduna e2e conversation ID: ${conversationId}`)

      const output = await sdk.withConversation(conversationId, async () => {
        const response = await model.invoke(prompt, {
          signal: AbortSignal.timeout(30_000),
        })

        return typeof response.content === 'string'
          ? response.content.trim()
          : response.content
              .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
              .join('')
              .trim()
      })

      expect(config.baseUrl).toBe(
        process.env.MODUNA_BASE_URL ?? 'https://volex-506013021984.asia-south1.run.app',
      )
      expect(output).toContain('MODUNA_E2E_OK')
      expect(sdk.getState().conversationId).toBeUndefined()

      await sdk.forceFlush()
    },
    45_000,
  )
})
