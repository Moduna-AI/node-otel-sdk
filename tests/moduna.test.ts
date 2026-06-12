import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createModunaSdk, type ModunaConfigurationError, moduna } from '../src/index.js'
import { MODUNA_DEFAULT_BASE_URL } from '../src/types/constant.js'

describe('initialize', () => {
  const originalApiKey = process.env.MODUNA_API_KEY
  const originalBaseUrl = process.env.MODUNA_BASE_URL

  beforeEach(() => {
    process.env.MODUNA_API_KEY = ''
    process.env.MODUNA_BASE_URL = ''
  })

  afterEach(() => {
    if (originalApiKey) {
      process.env.MODUNA_API_KEY = originalApiKey
    } else {
      process.env.MODUNA_API_KEY = ''
    }

    if (originalBaseUrl) {
      process.env.MODUNA_BASE_URL = originalBaseUrl
    } else {
      process.env.MODUNA_BASE_URL = ''
    }
  })

  it('prefers an inline api key over environment state', async () => {
    process.env.MODUNA_API_KEY = 'mod_env_123'
    const sdk = createModunaSdk(async () => undefined)

    const config = await sdk.initialize({
      appName: 'customer-support',
      apiKey: 'mod_inline_123',
    })

    expect(config.apiKey).toBe('mod_inline_123')
    expect(config.apiKeySource).toBe('config')
  })

  it('reads the API key from the environment when not provided inline', async () => {
    process.env.MODUNA_API_KEY = 'mod_env_123'
    const sdk = createModunaSdk(async () => undefined)

    const config = await sdk.initialize({
      appName: 'customer-support',
    })

    expect(config.apiKey).toBe('mod_env_123')
    expect(config.apiKeySource).toBe('env')
  })

  it('accepts API keys as opaque credentials without enforcing a prefix', async () => {
    const sdk = createModunaSdk(async () => undefined)

    const config = await sdk.initialize({
      appName: 'customer-support',
      apiKey: 'production-key-with-provider-defined-format',
    })

    expect(config.apiKey).toBe('production-key-with-provider-defined-format')
  })

  it('throws a guided error when the API key is missing', async () => {
    process.env.MODUNA_API_KEY = ''
    const sdk = createModunaSdk(async () => undefined)

    await expect(
      sdk.initialize({
        appName: 'customer-support',
      }),
    ).rejects.toMatchObject({
      context: {
        code: 'MISSING_API_KEY',
        envVar: 'MODUNA_API_KEY',
      },
    } satisfies Partial<ModunaConfigurationError>)
  })

  it('uses the built-in collector default when no override is provided', async () => {
    process.env.MODUNA_API_KEY = 'mod_env_123'
    process.env.MODUNA_BASE_URL = ''
    const sdk = createModunaSdk(async () => undefined)

    const config = await sdk.initialize({
      appName: 'customer-support',
    })

    expect(config.baseUrl).toBe(MODUNA_DEFAULT_BASE_URL)
  })

  it('uses MODUNA_BASE_URL when present', async () => {
    process.env.MODUNA_API_KEY = 'mod_env_123'
    process.env.MODUNA_BASE_URL = 'https://collector.example.com'
    const sdk = createModunaSdk(async () => undefined)

    const config = await sdk.initialize({
      appName: 'customer-support',
    })

    expect(config.baseUrl).toBe('https://collector.example.com')
  })
})

describe('conversation handling', () => {
  it('auto-generates a ULID-like conversation ID', async () => {
    const sdk = createModunaSdk(async () => undefined)

    await sdk.withConversation(async () => {
      const state = sdk.getState()
      expect(state.conversationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    })
  })

  it('preserves an explicit conversation ID', async () => {
    const sdk = createModunaSdk(async () => undefined)

    await sdk.withConversation('sess-123', async () => {
      expect(sdk.getState().conversationId).toBe('sess-123')
    })
  })

  it('propagates conversation scopes through the tracing bridge', async () => {
    const observedConversationIds: string[] = []
    const sdk = createModunaSdk(async () => ({
      initialize: () => undefined,
      withConversation: async (conversationId, task) => {
        observedConversationIds.push(conversationId)
        return await task()
      },
      forceFlush: async () => undefined,
    }))

    await sdk.initialize({
      appName: 'customer-support',
      apiKey: 'mod_test_123',
    })
    await sdk.withConversation('sess-bridge', async () => 'complete')

    expect(observedConversationIds).toEqual(['sess-bridge'])
  })

  it('wraps decorated methods in a conversation scope', async () => {
    const sdk = createModunaSdk(async () => undefined)

    class CustomerSupportService {
      public observedConversationId: string | undefined

      @sdk.conversation('sess-456')
      public async handleMessage(): Promise<string | undefined> {
        this.observedConversationId = sdk.getState().conversationId
        return this.observedConversationId
      }
    }

    const service = new CustomerSupportService()
    const result = await service.handleMessage()

    expect(result).toBe('sess-456')
    expect(service.observedConversationId).toBe('sess-456')
  })

  it('exports a shared singleton', () => {
    expect(typeof moduna.initialize).toBe('function')
    expect(typeof moduna.withConversation).toBe('function')
  })
})
