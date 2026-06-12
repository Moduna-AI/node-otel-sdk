/**
 * Discriminates the supported configuration failure modes that can happen during SDK setup.
 */
export type ModunaConfigurationErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'INVALID_APP_NAME'
  | 'INVALID_BASE_URL'

/**
 * Structured metadata attached to {@link ModunaConfigurationError}.
 */
export interface ModunaConfigurationErrorContext {
  /**
   * Machine-readable failure code.
   */
  readonly code: ModunaConfigurationErrorCode
  /**
   * Optional environment variable involved in the failure.
   */
  readonly envVar?: string
}
