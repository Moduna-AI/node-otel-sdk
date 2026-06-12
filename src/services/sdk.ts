import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  AsyncMethod,
  ConversationId,
  ConversationMethodDecorator,
  ConversationTask,
  ModunaInitializeOptions,
  ModunaStateSnapshot,
  ResolvedModunaConfig,
} from '../types/moduna.js'
import { createConversationId } from '../utils/ulid.js'
import { resolveConfig } from './config.js'
import { createOpenLlmetryBridge } from './openllmetry-bridge.js'

interface ConversationContext {
  readonly conversationId: ConversationId
}

/**
 * Public SDK contract exposed through the `moduna` singleton.
 */
export interface ModunaSdk {
  /**
   * Initializes the SDK and optionally boots the configured tracing bridge.
   *
   * @param options - SDK initialization options.
   * @returns Validated immutable SDK configuration.
   */
  initialize(options: ModunaInitializeOptions): Promise<ResolvedModunaConfig>
  /**
   * Runs async work inside a new automatically generated conversation scope.
   *
   * @typeParam TResult - Result type returned by the callback.
   * @param task - Async work executed inside the generated conversation scope.
   * @returns The callback result.
   */
  withConversation<TResult>(task: ConversationTask<TResult>): Promise<TResult>
  /**
   * Runs async work inside a specific conversation scope.
   *
   * @typeParam TResult - Result type returned by the callback.
   * @param conversationId - Explicit conversation ID to propagate.
   * @param task - Async work executed inside the supplied conversation scope.
   * @returns The callback result.
   */
  withConversation<TResult>(
    conversationId: ConversationId,
    task: ConversationTask<TResult>,
  ): Promise<TResult>
  /**
   * Creates a decorator that assigns an automatic conversation ID per invocation.
   *
   * @returns Method decorator for async class methods.
   */
  conversation(): ConversationMethodDecorator
  /**
   * Creates a decorator that propagates a specific conversation ID.
   *
   * @param conversationId - Explicit conversation ID to propagate.
   * @returns Method decorator for async class methods.
   */
  conversation(conversationId: ConversationId): ConversationMethodDecorator
  /**
   * Returns immutable runtime state for debugging and tests.
   *
   * @returns Current SDK state snapshot.
   */
  getState(): ModunaStateSnapshot
  /**
   * Flushes pending trace spans to the configured collector.
   *
   * @returns A promise that resolves after pending spans are exported.
   */
  forceFlush(): Promise<void>
}

/**
 * Creates an isolated SDK instance. This is exported for tests and advanced embedding scenarios.
 *
 * @param bridgeFactory - Optional tracing bridge factory override.
 * @returns A new isolated Moduna SDK instance.
 */
export const createModunaSdk = (
  bridgeFactory: () => Promise<
    | {
        initialize(config: ResolvedModunaConfig): Promise<void> | void
        withConversation<TResult>(
          conversationId: string,
          task: ConversationTask<TResult>,
        ): Promise<TResult>
        forceFlush(): Promise<void>
      }
    | undefined
  > = createOpenLlmetryBridge,
): ModunaSdk => {
  const storage = new AsyncLocalStorage<ConversationContext>()
  let config: ResolvedModunaConfig | undefined
  let bridge:
    | {
        initialize(config: ResolvedModunaConfig): Promise<void> | void
        withConversation<TResult>(
          conversationId: string,
          task: ConversationTask<TResult>,
        ): Promise<TResult>
        forceFlush(): Promise<void>
      }
    | undefined

  const initialize = async (options: ModunaInitializeOptions): Promise<ResolvedModunaConfig> => {
    const resolvedConfig = resolveConfig(options)
    bridge ??= await bridgeFactory()
    await bridge?.initialize(resolvedConfig)
    config = resolvedConfig
    return resolvedConfig
  }

  async function withConversation<TResult>(task: ConversationTask<TResult>): Promise<TResult>
  async function withConversation<TResult>(
    conversationId: ConversationId,
    task: ConversationTask<TResult>,
  ): Promise<TResult>
  async function withConversation<TResult>(
    firstArg: ConversationId | ConversationTask<TResult>,
    secondArg?: ConversationTask<TResult>,
  ): Promise<TResult> {
    const conversationId = typeof firstArg === 'string' ? firstArg : createConversationId()
    const task = typeof firstArg === 'string' ? secondArg : firstArg

    if (!task) {
      throw new TypeError('Moduna requires a task callback when using withConversation.')
    }

    return await storage.run({ conversationId }, async () => {
      if (bridge) {
        return await bridge.withConversation(conversationId, task)
      }

      return await task()
    })
  }

  const conversation = (conversationId?: ConversationId): ConversationMethodDecorator => {
    return <TThis, TArgs extends readonly unknown[], TResult>(
      _target: TThis,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<AsyncMethod<TArgs, TResult>>,
    ): TypedPropertyDescriptor<AsyncMethod<TArgs, TResult>> => {
      const originalMethod = descriptor.value

      if (!originalMethod) {
        throw new TypeError(
          `Moduna conversation decorator requires a method descriptor for ${String(propertyKey)}.`,
        )
      }

      descriptor.value = async function wrappedMethod(
        this: TThis,
        ...args: TArgs
      ): Promise<TResult> {
        return await withConversation(conversationId ?? createConversationId(), async () => {
          const boundMethod = originalMethod.bind(this) as (
            ...methodArgs: TArgs
          ) => Promise<TResult>
          return await boundMethod(...args)
        })
      } as AsyncMethod<TArgs, TResult>

      return descriptor
    }
  }

  const getState = (): ModunaStateSnapshot => {
    const currentConversationId = storage.getStore()?.conversationId

    return {
      initialized: config !== undefined,
      ...(config ? { config } : {}),
      ...(currentConversationId ? { conversationId: currentConversationId } : {}),
    }
  }

  const forceFlush = async (): Promise<void> => {
    await bridge?.forceFlush()
  }

  return {
    initialize,
    withConversation,
    conversation,
    getState,
    forceFlush,
  }
}

/**
 * Shared SDK singleton exported by the package root.
 */
export const moduna = createModunaSdk()
