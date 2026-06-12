import { z } from 'zod'

import { ModunaConfigurationError } from '../errors/moduna-configuration-error.js'
import {
  MODUNA_API_KEY_ENV,
  MODUNA_BASE_URL_ENV,
  MODUNA_DEFAULT_BASE_URL,
} from '../types/constant.js'
import type { ModunaInitializeOptions, ResolvedModunaConfig } from '../types/moduna.js'
import { readEnv } from '../utils/environment.js'

const initializeSchema = z.object({
  appName: z.string().trim().min(1, 'appName is required'),
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().url().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

/**
 * Resolves and validates user-provided and environment-driven SDK configuration.
 *
 * @param options - Initialization options supplied by the consumer.
 * @returns Immutable validated configuration used by the SDK runtime.
 * @throws {ModunaConfigurationError} When configuration is missing or invalid.
 */
export const resolveConfig = (options: ModunaInitializeOptions): ResolvedModunaConfig => {
  const parsed = initializeSchema.safeParse(options)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]

    if (issue?.path[0] === 'appName') {
      throw new ModunaConfigurationError(
        'Moduna requires a non-empty `appName` during initialization.',
        'INVALID_APP_NAME',
      )
    }

    if (issue?.path[0] === 'baseUrl') {
      throw new ModunaConfigurationError(
        'Moduna requires `baseUrl` to be a valid absolute URL.',
        'INVALID_BASE_URL',
        MODUNA_BASE_URL_ENV,
      )
    }

    throw new ModunaConfigurationError(
      'Moduna initialization options are invalid.',
      'INVALID_APP_NAME',
    )
  }

  const config = parsed.data
  const apiKeyFromEnv = readEnv(MODUNA_API_KEY_ENV)
  const apiKey = config.apiKey ?? apiKeyFromEnv

  if (!apiKey) {
    throw new ModunaConfigurationError(
      [
        'Moduna API key is missing.',
        `Set ${MODUNA_API_KEY_ENV} before starting your app: export ${MODUNA_API_KEY_ENV}=mod_live_...`,
        'Or place it in a `.env` file loaded by your runtime.',
        'You can also pass `apiKey` directly to `initialize({...})`.',
      ].join(' '),
      'MISSING_API_KEY',
      MODUNA_API_KEY_ENV,
    )
  }

  const baseUrl = config.baseUrl ?? readEnv(MODUNA_BASE_URL_ENV) ?? MODUNA_DEFAULT_BASE_URL
  const parsedBaseUrl = z.string().url().safeParse(baseUrl)

  if (!parsedBaseUrl.success) {
    throw new ModunaConfigurationError(
      'Moduna requires the collector base URL to be a valid absolute URL.',
      'INVALID_BASE_URL',
      MODUNA_BASE_URL_ENV,
    )
  }

  return {
    appName: config.appName,
    apiKey,
    baseUrl: parsedBaseUrl.data,
    apiKeySource: config.apiKey ? 'config' : 'env',
    metadata: Object.freeze({ ...(config.metadata ?? {}) }),
  }
}
