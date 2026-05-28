import {
	AbstractInputSuggest,
	App,
	Notice,
	PluginSettingTab,
	Setting,
	TFolder,
} from 'obsidian';
import { ConfigResolver, FolderConfig, LinkFormat } from './config-resolver';
import { PluginSettings } from './settings';
import type LinkStylesByFolder from './main';

// ─── Folder path autocomplete ─────────────────────────────────────────────────

class FolderSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && f.path !== '/' && f.path.toLowerCase().includes(lower),
			)
			.map((f) => f.path)
			.slice(0, 20);
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}

	selectSuggestion(path: string): void {
		this.setValue(path);
		this.close();
	}
}

// ─── Dropdown helpers ─────────────────────────────────────────────────────────

const LINK_STYLE_OPTIONS: Record<string, string> = {
	inherited: 'Inherited',
	wikilinks: '[[Wikilinks]]',
	markdown: 'Markdown links',
};

const FORMAT_OPTIONS: Record<string, string> = {
	inherited: 'Inherited',
	shortest: 'Shortest path',
	relative: 'Path from current file',
	absolute: 'Absolute path in vault',
};

function useMarkdownLinksKey(cfg: FolderConfig): string {
	if (cfg.useMarkdownLinks === undefined) return 'inherited';
	return cfg.useMarkdownLinks ? 'markdown' : 'wikilinks';
}

function linkFormatKey(cfg: FolderConfig): string {
	return cfg.newLinkFormat ?? 'inherited';
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

export class LinkStylesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: LinkStylesByFolder,
		private readonly resolver: ConfigResolver,
		private readonly settings: PluginSettings,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this._renderRootSection();
		void this._renderFolderRules(); // async — renders after scanning
		this._renderAddFolderRule();
		this._renderOnMoveSetting();
	}

	// ─── Root section (read-only) ──────────────────────────────────────────────

	private _renderRootSection(): void {
		new Setting(this.containerEl).setHeading().setName('Vault root (read-only)');

		const rootCfg = this.resolver.getRootConfig();

		new Setting(this.containerEl)
			.setName('Use [[wikilinks]]')
			.setDesc('The vault-wide setting from the Obsidian app config. Managed by Obsidian.')
			.addDropdown((dd) => {
				Object.entries(LINK_STYLE_OPTIONS).forEach(([k, v]) => { dd.addOption(k, v); });
				dd.setValue(useMarkdownLinksKey(rootCfg));
				dd.setDisabled(true);
			});

		new Setting(this.containerEl)
			.setName('New link format')
			.setDesc('The vault-wide setting from the Obsidian app config. Managed by Obsidian.')
			.addDropdown((dd) => {
				Object.entries(FORMAT_OPTIONS).forEach(([k, v]) => { dd.addOption(k, v); });
				dd.setValue(linkFormatKey(rootCfg));
				dd.setDisabled(true);
			});
	}

	// ─── Folder rules ──────────────────────────────────────────────────────────

	private async _renderFolderRules(): Promise<void> {
		const heading = new Setting(this.containerEl)
			.setHeading()
			.setName('Folder rules');
		heading.setDesc('Each folder with a custom app config. "inherited" means that key is absent from the file.');

		const folderConfigs = await this.resolver.scanFolderConfigs();

		if (folderConfigs.size === 0) {
			this.containerEl.createEl('p', {
				text: 'No subfolder rules found. Add one below.',
				cls: 'lsbf-empty-state',
			});
			return;
		}

		for (const [folderPath, cfg] of [...folderConfigs.entries()].sort()) {
			this._renderFolderRow(folderPath, cfg);
		}
	}

	private _renderFolderRow(folderPath: string, cfg: FolderConfig): void {
		const setting = new Setting(this.containerEl)
			.setName(folderPath)
			.setDesc('');

		setting.addDropdown((dd) => {
			Object.entries(LINK_STYLE_OPTIONS).forEach(([k, v]) => { dd.addOption(k, v); });
			dd.setValue(useMarkdownLinksKey(cfg));
			dd.onChange((value) => {
				const updated: FolderConfig = { ...cfg };
				if (value === 'inherited') {
					delete updated.useMarkdownLinks;
				} else {
					updated.useMarkdownLinks = value === 'markdown';
				}
				void this._saveFolderConfig(folderPath, updated);
				cfg.useMarkdownLinks = updated.useMarkdownLinks;
			});
		});

		setting.addDropdown((dd) => {
			Object.entries(FORMAT_OPTIONS).forEach(([k, v]) => { dd.addOption(k, v); });
			dd.setValue(linkFormatKey(cfg));
			dd.onChange((value) => {
				const updated: FolderConfig = { ...cfg };
				if (value === 'inherited') {
					delete updated.newLinkFormat;
				} else {
					updated.newLinkFormat = value as LinkFormat;
				}
				void this._saveFolderConfig(folderPath, updated);
				cfg.newLinkFormat = updated.newLinkFormat;
			});
		});
	}

	private async _saveFolderConfig(folderPath: string, config: FolderConfig): Promise<void> {
		try {
			await this.resolver.writeFolderConfig(folderPath, config);
		} catch (e) {
			new Notice(`Failed to save settings for ${folderPath}: ${String(e)}`);
		}
	}

	// ─── Add folder rule ───────────────────────────────────────────────────────

	private _renderAddFolderRule(): void {
		new Setting(this.containerEl).setHeading().setName('Add folder rule');

		let inputEl!: HTMLInputElement;

		const setting = new Setting(this.containerEl)
			.setName('Folder path')
			.setDesc('Vault-relative path (e.g. Posts/GitLab-wiki). Creates a config folder if it does not exist.')
			.addText((text) => {
				inputEl = text.inputEl;
				text.setPlaceholder('Folder/path');
				new FolderSuggest(this.app, inputEl);
			})
			.addButton((btn) => {
				btn.setButtonText('Add').setCta().onClick(() => {
					const folderPath = inputEl.value.trim().replace(/^\/|\/$/g, '');
					if (!folderPath) {
						new Notice('Please enter a folder path.');
						return;
					}
					if (folderPath === '') {
						new Notice('Cannot add a rule for the vault root — edit Obsidian settings directly.');
						return;
					}
					void this.resolver.writeFolderConfig(folderPath, {}).then(() => {
						inputEl.value = '';
						this.display();
					});
				});
			});

		// Allow confirming with Enter inside the text input.
		setting.controlEl.querySelector<HTMLButtonElement>('.mod-cta')?.addEventListener(
			'keydown',
			(e: KeyboardEvent) => {
				if (e.key === 'Enter') (e.target as HTMLButtonElement).click();
			},
		);
	}

	// ─── On-move behaviour ─────────────────────────────────────────────────────

	private _renderOnMoveSetting(): void {
		new Setting(this.containerEl).setHeading().setName('When moving a note');

		new Setting(this.containerEl)
			.setName('On move to a different style folder')
			.setDesc('What to do with the outgoing links inside a note that is moved to a folder with a different effective link style.')
			.addDropdown((dd) => {
				dd.addOption('ask', 'Ask every time');
				dd.addOption('always', 'Always update links');
				dd.addOption('never', 'Never update links');
				dd.setValue(this.settings.onMove);
				dd.onChange((value) => {
					this.settings.onMove = value as PluginSettings['onMove'];
					void this.plugin.saveSettings();
				});
			});
	}
}
