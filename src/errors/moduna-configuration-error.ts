import type {
  ModunaConfigurationErrorCode,
  ModunaConfigurationErrorContext,
} from '../types/errors.js'

/**
 * Error thrown when required Moduna SDK configuration is missing or invalid.
 */
export class ModunaConfigurationError extends Error {
  /**
   * Structured context describing the configuration failure.
   */
  public readonly context: ModunaConfigurationErrorContext

  /**
   * Creates a configuration error with structured metadata.
   *
   * @param message - Human-readable failure message.
   * @param code - Machine-readable error code.
   * @param envVar - Optional environment variable related to the failure.
   */
  public constructor(message: string, code: ModunaConfigurationErrorCode, envVar?: string) {
    super(message)
    this.name = 'ModunaConfigurationError'
    this.context = envVar ? { code, envVar } : { code }
  }
}
