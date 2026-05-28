// @ts-check
import tsParser from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';
import obsidianPlugin from 'eslint-plugin-obsidianmd';

export default [
	{ ignores: ['node_modules/**', 'main.js', '*.mjs', 'package.json', 'package-lock.json', 'versions.json', 'test/**', '*.config.ts'] },
	...tseslint.configs.recommendedTypeChecked.map(config => ({
		...config,
		files: ['src/**/*.ts'],
	})),
	...obsidianPlugin.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: './tsconfig.json',
				sourceType: 'module',
			},
		},
	},
];
