import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		globals: true,
	},
	resolve: {
		alias: {
			// Redirect all `import ... from 'obsidian'` to our test stub.
			obsidian: resolve(__dirname, 'test/__mocks__/obsidian.ts'),
		},
	},
});
