import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the SDK's TypeScript integration specs.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": import.meta.dirname,
		},
	},
	test: {
		include: ["test/*.ts"],
	},
});
