import { Events, FileManager, Plugin, TFile } from 'obsidian';
import { ConfigResolver } from './config-resolver';
import { generateLink } from './link-generator';
import { configsEqual, convertLinksInFile, ConvertLinksModal } from './move-handler';
import { LinkStylesSettingTab } from './settings-tab';
import { DEFAULT_SETTINGS, PluginSettings } from './settings';

export default class LinkStylesByFolder extends Plugin {
	settings!: PluginSettings;
	private resolver!: ConfigResolver;

	/** Saved so we can restore it in onunload. */
	private _origGenerateMarkdownLink!: FileManager['generateMarkdownLink'];

	async onload(): Promise<void> {
		await this.loadSettings();

		this.resolver = new ConfigResolver(this.app);

		// Pre-warm the config cache so synchronous resolution works immediately
		// for files the user starts editing right away.
		await this.resolver.preloadCache();

		// ── Patch generateMarkdownLink ───────────────────────────────────────
		// Obsidian calls this method whenever it inserts an internal link:
		//  • [[  autocomplete confirmed with Enter
		//  • "Add Internal Link" command
		//  • Any other built-in link insertion
		// We intercept it to apply the per-folder style for the source file.
		this._origGenerateMarkdownLink =
			this.app.fileManager.generateMarkdownLink.bind(this.app.fileManager);

		this.app.fileManager.generateMarkdownLink = (
			file: TFile,
			sourcePath: string,
			subpath?: string,
			alias?: string,
		): string => {
			const config = this.resolver.resolveSync(sourcePath);
			if (!config) {
				// Cache miss (shouldn't happen after preload, but be safe).
				return this._origGenerateMarkdownLink(file, sourcePath, subpath, alias);
			}
			return generateLink(this.app, file, sourcePath, subpath, alias, config);
		};

		// ── Watch for file renames / moves ────────────────────────────────────
		this.registerEvent(
			this.app.vault.on('rename', (abstractFile, oldPath) => {
				if (!(abstractFile instanceof TFile)) return;
				if (abstractFile.extension !== 'md') return;
				void this._handleMove(abstractFile, oldPath);
			}),
		);

		// ── Invalidate cache when a .obsidian/app.json changes ────────────────
		// `raw` is an internal Obsidian event not in the public type declarations.
		this.registerEvent(
			(this.app.vault as unknown as Events).on('raw', (path: unknown) => {
				if (typeof path !== 'string') return;
				const configFile = `${this.app.vault.configDir}/app.json`;
				if (!path.endsWith(`/${configFile}`) && path !== configFile) return;
				const folderPath = path === configFile ? '' : path.slice(0, -(configFile.length + 1));
				this.resolver.invalidate(folderPath);
				void this.resolver.loadFolderConfig(folderPath);
			}),
		);

		// ── Settings tab ──────────────────────────────────────────────────────
		this.addSettingTab(
			new LinkStylesSettingTab(this.app, this, this.resolver, this.settings),
		);
	}

	onunload(): void {
		// Restore Obsidian's original link generator.
		this.app.fileManager.generateMarkdownLink = this._origGenerateMarkdownLink;
	}

	// ─── Settings persistence ──────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ─── Move handling ─────────────────────────────────────────────────────────

	private async _handleMove(file: TFile, oldPath: string): Promise<void> {
		// Resolve configs for old and new locations.
		const [oldConfig, newConfig] = await Promise.all([
			this.resolver.resolveAsync(oldPath),
			this.resolver.resolveAsync(file.path),
		]);

		if (configsEqual(oldConfig, newConfig)) return; // nothing to do

		const onMove = this.settings.onMove;

		if (onMove === 'never') return;

		if (onMove === 'always') {
			await convertLinksInFile(this.app, file, newConfig);
			return;
		}

		// 'ask'
		const modal = new ConvertLinksModal(this.app, file, newConfig);
		modal.open();
		const choice = await modal.result;

		if (choice === 'update' || choice === 'always') {
			await convertLinksInFile(this.app, file, newConfig);
		}

		if (choice === 'always') {
			this.settings.onMove = 'always';
			await this.saveSettings();
		} else if (choice === 'never') {
			this.settings.onMove = 'never';
			await this.saveSettings();
		}
	}
}
