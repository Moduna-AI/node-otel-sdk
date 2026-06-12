/**
 * Controls how the SDK authenticates and labels traces.
 */
export interface ModunaInitializeOptions {
  /**
   * Name displayed in tracing backends for the instrumented application.
   *
   * @example
   * ```ts
   * const options: ModunaInitializeOptions = {
   *   appName: 'customer-support'
   * }
   * ```
   */
  readonly appName: string
  /**
   * API key used when the host process should not rely on environment variables.
   */
  readonly apiKey?: string
  /**
   * Explicit collector base URL. When omitted, Moduna resolves this from `MODUNA_BASE_URL`
   * and finally falls back to the SDK default collector endpoint.
   */
  readonly baseUrl?: string
  /**
   * Optional metadata forwarded to the tracing bridge for future adapter-specific behavior.
   */
  readonly metadata?: Readonly<Record<string, string>>
}

/**
 * Describes where a resolved API key originated from.
 */
export type ApiKeySource = 'config' | 'env'

/**
 * Resolved immutable SDK configuration used internally after validation.
 */
export interface ResolvedModunaConfig {
  /**
   * Application name reported to the tracing backend.
   */
  readonly appName: string
  /**
   * Validated API key used by the tracing bridge.
   */
  readonly apiKey: string
  /**
   * Validated collector base URL.
   */
  readonly baseUrl: string
  /**
   * Source of the selected API key.
   */
  readonly apiKeySource: ApiKeySource
  /**
   * Optional metadata forwarded to the tracing bridge.
   */
  readonly metadata: Readonly<Record<string, string>>
}

/**
 * The conversation identifier format exposed by the SDK.
 */
export type ConversationId = string

/**
 * The async work accepted by `withConversation`.
 *
 * @typeParam TResult - Result type returned by the instrumented callback.
 */
export type ConversationTask<TResult> = () => Promise<TResult> | TResult

/**
 * A method shape that can be decorated with `conversation()`.
 *
 * @typeParam TArgs - Parameter list of the decorated method.
 * @typeParam TResult - Promise result of the decorated method.
 */
export type AsyncMethod<TArgs extends readonly unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>

/**
 * Public read-only snapshot of the current SDK state.
 */
export interface ModunaStateSnapshot {
  /**
   * Indicates whether the SDK has been initialized.
   */
  readonly initialized: boolean
  /**
   * Current validated configuration when initialized.
   */
  readonly config?: ResolvedModunaConfig
  /**
   * Current conversation ID in async context, if one is active.
   */
  readonly conversationId?: ConversationId
}

/**
 * Legacy decorator shape supported by TypeScript's experimental decorator emit.
 */
export type ConversationMethodDecorator = <TThis, TArgs extends readonly unknown[], TResult>(
  target: TThis,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<AsyncMethod<TArgs, TResult>>,
) => TypedPropertyDescriptor<AsyncMethod<TArgs, TResult>> | undefined
