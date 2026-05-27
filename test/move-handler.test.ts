import { describe, it, expect } from 'vitest';
import { configsEqual } from '../src/move-handler';
import type { ResolvedConfig } from '../src/config-resolver';

const cfg = (useMarkdownLinks: boolean, newLinkFormat: ResolvedConfig['newLinkFormat']): ResolvedConfig => ({
	useMarkdownLinks,
	newLinkFormat,
});

describe('configsEqual', () => {
	it('returns true when both fields match', () => {
		expect(configsEqual(cfg(false, 'shortest'), cfg(false, 'shortest'))).toBe(true);
		expect(configsEqual(cfg(true, 'relative'), cfg(true, 'relative'))).toBe(true);
		expect(configsEqual(cfg(true, 'absolute'), cfg(true, 'absolute'))).toBe(true);
	});

	it('returns false when useMarkdownLinks differs', () => {
		expect(configsEqual(cfg(false, 'shortest'), cfg(true, 'shortest'))).toBe(false);
	});

	it('returns false when newLinkFormat differs', () => {
		expect(configsEqual(cfg(false, 'shortest'), cfg(false, 'relative'))).toBe(false);
		expect(configsEqual(cfg(false, 'relative'), cfg(false, 'absolute'))).toBe(false);
	});

	it('returns false when both fields differ', () => {
		expect(configsEqual(cfg(false, 'shortest'), cfg(true, 'absolute'))).toBe(false);
	});
});
