import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the SDK's TypeScript integration specs.
 */
export default defineConfig({
	test: {
		include: ["test/*.ts"],
	},
});
