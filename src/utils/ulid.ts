const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Generates a ULID-compatible identifier for chronological conversation grouping.
 *
 * @returns A 26-character Crockford Base32 ULID string.
 */
export const createConversationId = (): string => {
  const time = Date.now()
  const timeChars = encodeTime(time, 10)
  const randomChars = encodeRandom(16)

  return `${timeChars}${randomChars}`
}

const encodeTime = (value: number, length: number): string => {
  let remaining = value
  let output = ''

  for (let index = 0; index < length; index += 1) {
    const characterIndex = remaining % 32
    output = `${ENCODING[characterIndex] ?? ENCODING[0]}${output}`
    remaining = Math.floor(remaining / 32)
  }

  return output
}

const encodeRandom = (length: number): string => {
  let output = ''
  const values = crypto.getRandomValues(new Uint8Array(length))

  for (const value of values) {
    output += ENCODING[value % 32] ?? ENCODING[0]
  }

  return output
}
