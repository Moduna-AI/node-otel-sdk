import type { AttributeValue } from "@opentelemetry/api";

/**
 * Converts arbitrary values to supported OpenTelemetry attribute values.
 *
 * @param value Unknown source value.
 * @returns OpenTelemetry attribute value when representable.
 */
export const toAttributeValue = (
	value: unknown,
): AttributeValue | undefined => {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		if (value.every((item) => typeof item === "string")) {
			return value;
		}

		if (value.every((item) => typeof item === "number")) {
			return value;
		}

		if (value.every((item) => typeof item === "boolean")) {
			return value;
		}

		return JSON.stringify(value);
	}

	if (value && typeof value === "object") {
		return JSON.stringify(value);
	}

	return undefined;
};

/**
 * Reads an object-valued property from a record-like value.
 *
 * @param value Record-like source value.
 * @param key Property key.
 * @returns Nested record when present.
 */
export const getRecord = (
	value: unknown,
	key: string,
): Record<string, unknown> | undefined => {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const result = record[key];

	return result && typeof result === "object" && !Array.isArray(result)
		? (result as Record<string, unknown>)
		: undefined;
};

/**
 * Reads a string-valued property from a record-like value.
 *
 * @param value Record-like source value.
 * @param key Property key.
 * @returns String property when present.
 */
export const getString = (value: unknown, key: string): string | undefined => {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const result = record[key];

	return typeof result === "string" ? result : undefined;
};

/**
 * Reads a number-valued property from a record-like value.
 *
 * @param value Record-like source value.
 * @param key Property key.
 * @returns Number property when present.
 */
export const getNumber = (value: unknown, key: string): number | undefined => {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const result = record[key];

	return typeof result === "number" ? result : undefined;
};

/**
 * Normalizes unknown errors to Error instances.
 *
 * @param error Unknown error value.
 * @returns Error instance.
 */
export const toError = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));
