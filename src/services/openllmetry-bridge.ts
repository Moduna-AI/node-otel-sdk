import type { ResolvedModunaConfig } from '../types/moduna.js'

/**
 * Minimal bridge interface that isolates Moduna from vendor package surface changes.
 */
export interface OpenLlmetryBridge {
  /**
   * Initializes the underlying tracing provider.
   *
   * @param config - Resolved Moduna configuration.
   */
  initialize(config: ResolvedModunaConfig): Promise<void> | void
  /**
   * Runs work inside the vendor conversation context.
   *
   * @param conversationId - Conversation ID propagated to trace spans.
   * @param task - Work executed inside the conversation context.
   * @returns The task result.
   */
  withConversation<TResult>(
    conversationId: string,
    task: () => Promise<TResult> | TResult,
  ): Promise<TResult>
  /**
   * Flushes pending spans to the configured collector.
   */
  forceFlush(): Promise<void>
}

/**
 * Vendor module shape consumed through dynamic import.
 */
interface TraceloopModule {
  initialize?: (options: Record<string, unknown>) => Promise<void> | void
  withConversation?: <TResult>(
    conversationId: string,
    task: () => Promise<TResult> | TResult,
  ) => Promise<TResult>
  forceFlush?: () => Promise<void>
}

const TRACEOLOOP_CANDIDATES = ['@traceloop/node-server-sdk'] as const

/**
 * Creates a bridge backed by the first available Traceloop/OpenLLMetry package.
 *
 * @returns A bridge or `undefined` when the vendor package is not installed.
 */
export const createOpenLlmetryBridge = async (): Promise<OpenLlmetryBridge | undefined> => {
  const module = await loadFirstAvailableModule()

  if (!module?.initialize || !module.withConversation || !module.forceFlush) {
    return undefined
  }

  const initialize = module.initialize
  const withConversation = module.withConversation
  const forceFlush = module.forceFlush

  return {
    initialize: async (config) => {
      await initialize({
        appName: config.appName,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        metadata: config.metadata,
      })
    },
    withConversation: async (conversationId, task) => {
      return await withConversation(conversationId, task)
    },
    forceFlush: async () => {
      await forceFlush()
    },
  }
}

const loadFirstAvailableModule = async (): Promise<TraceloopModule | undefined> => {
  for (const candidate of TRACEOLOOP_CANDIDATES) {
    try {
      const loaded = await import(candidate)

      if (isTraceloopModule(loaded)) {
        return loaded
      }
    } catch (error) {
      if (!isModuleNotFoundError(error)) {
        throw error
      }
    }
  }

  return undefined
}

const isTraceloopModule = (value: unknown): value is TraceloopModule => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const maybeModule = value as {
    initialize?: unknown
    withConversation?: unknown
    forceFlush?: unknown
  }

  return (
    (maybeModule.initialize === undefined || typeof maybeModule.initialize === 'function') &&
    (maybeModule.withConversation === undefined ||
      typeof maybeModule.withConversation === 'function') &&
    (maybeModule.forceFlush === undefined || typeof maybeModule.forceFlush === 'function')
  )
}

const isModuleNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message.includes('Cannot find package') ||
    error.message.includes('Cannot find module') ||
    error.message.includes('ERR_MODULE_NOT_FOUND')
  )
}
