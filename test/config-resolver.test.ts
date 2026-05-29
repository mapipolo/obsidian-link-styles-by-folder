import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { ConfigResolver } from '../src/config-resolver';

// ── Helpers ───────────────────────────────────────────────────────────────────

function file(path: string): TFile { return new TFile(path); }

type AdapterMock = {
	exists: ReturnType<typeof vi.fn>;
	read: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	mkdir: ReturnType<typeof vi.fn>;
};

/**
 * Build a minimal App whose adapter is pre-loaded with a map of
 * configPath → JSON string content.  Any path not in the map returns
 * exists=false.
 */
function makeApp(
	configFiles: Record<string, object> = {},
	vaultFiles: TFile[] = [],
	liveSettings: Record<string, unknown> = {},
): { app: App; adapter: AdapterMock } {
	const jsonFiles: Record<string, string> = {};
	for (const [k, v] of Object.entries(configFiles)) {
		jsonFiles[k] = JSON.stringify(v);
	}

	const adapter: AdapterMock = {
		exists: vi.fn(async (path: string) => path in jsonFiles),
		read: vi.fn(async (path: string) => {
			if (path in jsonFiles) return jsonFiles[path]!;
			throw new Error(`Not found: ${path}`);
		}),
		write: vi.fn(async () => undefined),
		mkdir: vi.fn(async () => undefined),
	};

	const app = {
		vault: {
			adapter,
			configDir: '.obsidian',
			getFiles: () => vaultFiles,
			getAllLoadedFiles: () => vaultFiles,
			config: liveSettings,
		},
	} as unknown as App;

	return { app, adapter };
}

// ── resolveAsync: cascade scenarios ──────────────────────────────────────────

describe('ConfigResolver – cascade rules', () => {
	it('uses both settings when the nearest folder has them', async () => {
		const { app } = makeApp({
			'posts/.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'relative' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/note.md');
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'relative' });
	});

	it('inherits missing key from a parent folder', async () => {
		const { app } = makeApp({
			'posts/wiki/.obsidian/app.json': { useMarkdownLinks: true },
			'posts/.obsidian/app.json': { newLinkFormat: 'absolute' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/wiki/note.md');
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'absolute' });
	});

	it('deepest config wins when both folders set the same key', async () => {
		const { app } = makeApp({
			'posts/wiki/.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'relative' },
			'posts/.obsidian/app.json': { useMarkdownLinks: false, newLinkFormat: 'shortest' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/wiki/note.md');
		// child overrides both keys
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'relative' });
	});

	it('falls through to vault root when subfolders set nothing', async () => {
		const { app } = makeApp({
			'.obsidian/app.json': { useMarkdownLinks: false, newLinkFormat: 'absolute' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/wiki/note.md');
		expect(result).toEqual({ useMarkdownLinks: false, newLinkFormat: 'absolute' });
	});

	it("falls back to Obsidian's live settings when no app.json sets the key", async () => {
		const { app } = makeApp(
			{},
			[],
			{ useMarkdownLinks: true, newLinkFormat: 'relative' },
		);
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('notes/note.md');
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'relative' });
	});

	it('falls back to hardcoded defaults when live settings also absent', async () => {
		const { app } = makeApp({}, [], {});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('note.md');
		// Hardcoded defaults: false / shortest
		expect(result).toEqual({ useMarkdownLinks: false, newLinkFormat: 'shortest' });
	});

	it('ignores keys in app.json that are not the managed two', async () => {
		const { app } = makeApp({
			'posts/.obsidian/app.json': { useMarkdownLinks: true, someOtherKey: 'ignored', newLinkFormat: 'relative' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/note.md');
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'relative' });
	});

	it('treats a partial config (neither key) as absent — continues up', async () => {
		const { app } = makeApp({
			'posts/.obsidian/app.json': { unrelated: true },
			'.obsidian/app.json': { useMarkdownLinks: false, newLinkFormat: 'shortest' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('posts/note.md');
		expect(result).toEqual({ useMarkdownLinks: false, newLinkFormat: 'shortest' });
	});

	it('handles a file at vault root (no parent folder)', async () => {
		const { app } = makeApp({
			'.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'absolute' },
		});
		const resolver = new ConfigResolver(app);
		const result = await resolver.resolveAsync('root-note.md');
		expect(result).toEqual({ useMarkdownLinks: true, newLinkFormat: 'absolute' });
	});
});

// ── resolveSync ───────────────────────────────────────────────────────────────

describe('ConfigResolver – resolveSync', () => {
	it('returns null (cache miss) before the cache is warmed', () => {
		const { app } = makeApp({
			'posts/.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'relative' },
		});
		const resolver = new ConfigResolver(app);
		// Cache is cold — should return null and schedule a load.
		expect(resolver.resolveSync('posts/note.md')).toBeNull();
	});

	it('returns the correct config after preloadCache()', async () => {
		const { app } = makeApp(
			{ 'posts/.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'relative' } },
			[file('posts/note.md')],
		);
		const resolver = new ConfigResolver(app);
		await resolver.preloadCache();
		expect(resolver.resolveSync('posts/note.md')).toEqual({
			useMarkdownLinks: true,
			newLinkFormat: 'relative',
		});
	});
});

// ── Cache invalidation ────────────────────────────────────────────────────────

describe('ConfigResolver – invalidation', () => {
	it('re-reads the file after invalidate() + loadFolderConfig()', async () => {
		const configFiles: Record<string, object> = {
			'posts/.obsidian/app.json': { useMarkdownLinks: false, newLinkFormat: 'shortest' },
		};
		const { app, adapter } = makeApp(configFiles);

		const resolver = new ConfigResolver(app);
		await resolver.loadFolderConfig('posts');

		let result = await resolver.resolveAsync('posts/note.md');
		expect(result.useMarkdownLinks).toBe(false);

		// Simulate the file being updated externally.
		const updated = JSON.stringify({ useMarkdownLinks: true, newLinkFormat: 'absolute' });
		adapter.read.mockResolvedValue(updated);
		adapter.exists.mockResolvedValue(true);

		resolver.invalidate('posts');
		await resolver.loadFolderConfig('posts');

		result = await resolver.resolveAsync('posts/note.md');
		expect(result.useMarkdownLinks).toBe(true);
		expect(result.newLinkFormat).toBe('absolute');
	});
});

// ── writeFolderConfig ─────────────────────────────────────────────────────────

describe('ConfigResolver – writeFolderConfig', () => {
	it('writes both settings to a new file', async () => {
		const { app, adapter } = makeApp();
		const resolver = new ConfigResolver(app);

		await resolver.writeFolderConfig('posts', {
			useMarkdownLinks: true,
			newLinkFormat: 'relative',
		});

		expect(adapter.write).toHaveBeenCalledOnce();
		const [, written] = adapter.write.mock.calls[0] as [string, string];
		const parsed = JSON.parse(written) as Record<string, unknown>;
		expect(parsed.useMarkdownLinks).toBe(true);
		expect(parsed.newLinkFormat).toBe('relative');
	});

	it('merges into an existing file, preserving other keys', async () => {
		const { app, adapter } = makeApp({
			'posts/.obsidian/app.json': { useMarkdownLinks: false, someOtherKey: 'keep-me' },
		});
		const resolver = new ConfigResolver(app);

		await resolver.writeFolderConfig('posts', { useMarkdownLinks: true });

		const [, written] = adapter.write.mock.calls[0] as [string, string];
		const parsed = JSON.parse(written) as Record<string, unknown>;
		expect(parsed.useMarkdownLinks).toBe(true);
		expect(parsed.someOtherKey).toBe('keep-me');
	});

	it('removes a key from the file when undefined is passed', async () => {
		const { app, adapter } = makeApp({
			'posts/.obsidian/app.json': { useMarkdownLinks: true, newLinkFormat: 'relative' },
		});
		const resolver = new ConfigResolver(app);

		// Pass undefined for newLinkFormat to remove it.
		await resolver.writeFolderConfig('posts', { useMarkdownLinks: true });

		const [, written] = adapter.write.mock.calls[0] as [string, string];
		const parsed = JSON.parse(written) as Record<string, unknown>;
		expect('newLinkFormat' in parsed).toBe(false);
	});

	it('throws when attempting to write to the vault root', async () => {
		const { app } = makeApp();
		const resolver = new ConfigResolver(app);
		await expect(resolver.writeFolderConfig('', {})).rejects.toThrow();
	});
});
