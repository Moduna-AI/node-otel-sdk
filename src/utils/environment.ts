/**
 * Reads an environment variable from the current process, normalizing empty values to `undefined`.
 *
 * @param name - Environment variable name.
 * @returns Trimmed environment variable or `undefined` when unset.
 */
export const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim()

  return value === '' ? undefined : value
}
