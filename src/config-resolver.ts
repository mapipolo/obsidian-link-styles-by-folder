import { App, normalizePath } from 'obsidian';

export type LinkFormat = 'shortest' | 'relative' | 'absolute';

/** The two link-style keys we manage, both optional (absent = inherited). */
export interface FolderConfig {
	useMarkdownLinks?: boolean;
	newLinkFormat?: LinkFormat;
}

/** Fully-resolved, non-optional effective settings for a given file. */
export interface ResolvedConfig {
	useMarkdownLinks: boolean;
	newLinkFormat: LinkFormat;
}

const LINK_FORMAT_VALUES = new Set(['shortest', 'relative', 'absolute']);

function isLinkFormat(v: unknown): v is LinkFormat {
	return typeof v === 'string' && LINK_FORMAT_VALUES.has(v);
}

/**
 * Resolves the effective link-style settings for any file in the vault by
 * walking up the directory tree, merging .obsidian/app.json files (deepest
 * wins per key), and falling back to Obsidian's live settings.
 *
 * All folder-level configs are cached; call invalidate() or invalidateAll()
 * when an app.json is written outside of writeFolderConfig().
 */
export class ConfigResolver {
	/** folderPath ('' = vault root) → parsed config, or null if absent/invalid */
	private readonly cache = new Map<string, FolderConfig | null>();
	/** Tracks in-flight async loads so we don't double-fetch the same folder. */
	private readonly pending = new Map<string, Promise<void>>();

	constructor(private readonly app: App) {}

	// ─── Cache population ──────────────────────────────────────────────────────

	/**
	 * Pre-warms the cache for every folder that currently contains files.
	 * Call once from onload() so synchronous resolution is warm from the start.
	 */
	async preloadCache(): Promise<void> {
		const folderPaths = new Set<string>(['']); // always include root
		for (const file of this.app.vault.getFiles()) {
			const parts = file.path.split('/');
			for (let i = 1; i < parts.length; i++) {
				folderPaths.add(parts.slice(0, i).join('/'));
			}
		}
		await Promise.all([...folderPaths].map((fp) => this.loadFolderConfig(fp)));
	}

	/**
	 * Loads the config for a single folder.  Safe to call multiple times;
	 * subsequent calls for the same path are no-ops.
	 */
	async loadFolderConfig(folderPath: string): Promise<void> {
		if (this.cache.has(folderPath)) return;
		if (this.pending.has(folderPath)) {
			await this.pending.get(folderPath);
			return;
		}
		const load = this._doLoad(folderPath);
		this.pending.set(folderPath, load);
		await load;
		this.pending.delete(folderPath);
	}

	private async _doLoad(folderPath: string): Promise<void> {
		const configPath = this._configPath(folderPath);
		try {
			const exists = await this.app.vault.adapter.exists(configPath);
			if (!exists) {
				this.cache.set(folderPath, null);
				return;
			}
			const raw = await this.app.vault.adapter.read(configPath);
			const json = JSON.parse(raw) as Record<string, unknown>;
			const config: FolderConfig = {};
			if (typeof json.useMarkdownLinks === 'boolean') {
				config.useMarkdownLinks = json.useMarkdownLinks;
			}
			if (isLinkFormat(json.newLinkFormat)) {
				config.newLinkFormat = json.newLinkFormat;
			}
			this.cache.set(folderPath, Object.keys(config).length > 0 ? config : null);
		} catch {
			this.cache.set(folderPath, null);
		}
	}

	// ─── Resolution ────────────────────────────────────────────────────────────

	/**
	 * Synchronous resolution from cache.  Returns null only if the cache is not
	 * yet warm for some folder in the chain — callers should fall back to
	 * Obsidian's own behaviour in that case and schedule an async load.
	 */
	resolveSync(filePath: string): ResolvedConfig | null {
		const parts = filePath.split('/');
		parts.pop(); // strip filename

		let useMarkdownLinks: boolean | undefined;
		let newLinkFormat: LinkFormat | undefined;

		for (let i = parts.length; i >= 0; i--) {
			const folderPath = parts.slice(0, i).join('/');

			if (!this.cache.has(folderPath)) {
				// Schedule async load for next time, return null for now.
				void this.loadFolderConfig(folderPath);
				return null;
			}

			const config = this.cache.get(folderPath);
			if (config) {
				if (useMarkdownLinks === undefined && config.useMarkdownLinks !== undefined) {
					useMarkdownLinks = config.useMarkdownLinks;
				}
				if (newLinkFormat === undefined && config.newLinkFormat !== undefined) {
					newLinkFormat = config.newLinkFormat;
				}
			}

			if (useMarkdownLinks !== undefined && newLinkFormat !== undefined) break;
		}

		return {
			useMarkdownLinks: useMarkdownLinks ?? this._liveSetting('useMarkdownLinks', false),
			newLinkFormat: newLinkFormat ?? this._liveSetting('newLinkFormat', 'shortest' as LinkFormat),
		};
	}

	/** Async resolution — guaranteed result even on cache miss. */
	async resolveAsync(filePath: string): Promise<ResolvedConfig> {
		const parts = filePath.split('/');
		parts.pop();

		// Ensure all ancestors are loaded.
		await Promise.all(
			Array.from({ length: parts.length + 1 }, (_, i) =>
				this.loadFolderConfig(parts.slice(0, i).join('/')),
			),
		);

		// resolveSync is now guaranteed to succeed.
		return this.resolveSync(filePath)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
	}

	// ─── Writing ───────────────────────────────────────────────────────────────

	/**
	 * Writes useMarkdownLinks / newLinkFormat into a non-root folder's
	 * .obsidian/app.json, merging with any existing keys in that file.
	 * Passing undefined for a key removes it from the file.
	 */
	async writeFolderConfig(folderPath: string, config: FolderConfig): Promise<void> {
		if (!folderPath) throw new Error('Cannot write to vault-root app.json');

		const configPath = this._configPath(folderPath);
		const dirPath = normalizePath(folderPath + '/.obsidian');

		// Merge with existing file content.
		let existing: Record<string, unknown> = {};
		try {
			if (await this.app.vault.adapter.exists(configPath)) {
				const raw = await this.app.vault.adapter.read(configPath);
				existing = JSON.parse(raw) as Record<string, unknown>;
			}
		} catch { /* start fresh */ }

		if (config.useMarkdownLinks !== undefined) {
			existing.useMarkdownLinks = config.useMarkdownLinks;
		} else {
			delete existing.useMarkdownLinks;
		}
		if (config.newLinkFormat !== undefined) {
			existing.newLinkFormat = config.newLinkFormat;
		} else {
			delete existing.newLinkFormat;
		}

		// Ensure .obsidian dir exists.
		if (!(await this.app.vault.adapter.exists(dirPath))) {
			await this.app.vault.adapter.mkdir(dirPath);
		}

		await this.app.vault.adapter.write(configPath, JSON.stringify(existing, null, 2) + '\n');

		// Refresh cache.
		this.invalidate(folderPath);
		await this.loadFolderConfig(folderPath);
	}

	// ─── Introspection (for settings UI) ──────────────────────────────────────

	/** Returns the raw config from vault-root app.json (read-only reference). */
	getRootConfig(): FolderConfig {
		return this.cache.get('') ?? {};
	}

	/**
	 * Scans the vault for all subdirectory .obsidian/app.json files and returns
	 * a map of folderPath → FolderConfig.  This is the authoritative list for
	 * the settings UI (it does a fresh filesystem scan, not just the runtime cache).
	 */
	async scanFolderConfigs(): Promise<Map<string, FolderConfig>> {
		const result = new Map<string, FolderConfig>();

		// Collect all unique non-root folder paths.
		const folderPaths = new Set<string>();
		for (const f of this.app.vault.getAllLoadedFiles()) {
			const parts = f.path.split('/');
			for (let i = 1; i < parts.length; i++) {
				folderPaths.add(parts.slice(0, i).join('/'));
			}
		}

		await Promise.all(
			[...folderPaths].map(async (fp) => {
				const configPath = this._configPath(fp);
				try {
					if (!(await this.app.vault.adapter.exists(configPath))) return;
					const raw = await this.app.vault.adapter.read(configPath);
					const json = JSON.parse(raw) as Record<string, unknown>;
					const config: FolderConfig = {};
					if (typeof json.useMarkdownLinks === 'boolean') {
						config.useMarkdownLinks = json.useMarkdownLinks;
					}
					if (isLinkFormat(json.newLinkFormat)) {
						config.newLinkFormat = json.newLinkFormat;
					}
					if (Object.keys(config).length > 0) {
						result.set(fp, config);
						this.cache.set(fp, config); // keep cache in sync
					}
				} catch { /* skip */ }
			}),
		);

		return result;
	}

	// ─── Cache management ──────────────────────────────────────────────────────

	invalidate(folderPath: string): void {
		this.cache.delete(folderPath);
	}

	invalidateAll(): void {
		this.cache.clear();
	}

	// ─── Helpers ───────────────────────────────────────────────────────────────

	private _configPath(folderPath: string): string {
		return normalizePath((folderPath ? folderPath + '/' : '') + '.obsidian/app.json');
	}

	private _liveSetting<T>(key: string, defaultValue: T): T {
		const config = (this.app.vault as unknown as { config?: Record<string, unknown> }).config;
		if (config && key in config) return config[key] as T;
		return defaultValue;
	}
}
