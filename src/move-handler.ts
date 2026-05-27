import { App, Modal, TFile } from 'obsidian';
import { ResolvedConfig } from './config-resolver';
import { reformatAllLinks } from './link-reformatter';

export type MoveChoice = 'update' | 'leave' | 'always' | 'never';

/**
 * Compares two resolved configs for link-style equality.
 */
export function configsEqual(a: ResolvedConfig, b: ResolvedConfig): boolean {
	return a.useMarkdownLinks === b.useMarkdownLinks && a.newLinkFormat === b.newLinkFormat;
}

/**
 * Rewrites all outgoing links in `file` to match `newConfig`.
 * Uses Vault.process() for an atomic read-modify-write.
 */
export async function convertLinksInFile(
	app: App,
	file: TFile,
	newConfig: ResolvedConfig,
): Promise<void> {
	await app.vault.process(file, (content) =>
		reformatAllLinks(app, content, file.path, newConfig),
	);
}

// ─── Move dialog ──────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ResolvedConfig['newLinkFormat'], string> = {
	shortest: 'Shortest path',
	relative: 'Path from current file',
	absolute: 'Absolute path in vault',
};

/**
 * Modal shown when onMove === 'ask' and a note crosses a style boundary.
 * Resolves with the user's choice.
 */
export class ConvertLinksModal extends Modal {
	private resolve!: (choice: MoveChoice) => void;
	readonly result: Promise<MoveChoice>;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly newConfig: ResolvedConfig,
	) {
		super(app);
		this.result = new Promise<MoveChoice>((res) => {
			this.resolve = res;
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update link styles?' });

		const styleName = this.newConfig.useMarkdownLinks ? 'Markdown links' : '[[Wikilinks]]';
		const formatName = FORMAT_LABELS[this.newConfig.newLinkFormat];

		contentEl.createEl('p', {
			text: `"${this.file.basename}" is moving to a folder with a different link style.`,
		});
		contentEl.createEl('p').createEl('strong', {
			text: `New style: ${styleName} · ${formatName}`,
		});

		const buttonRow = contentEl.createDiv({ cls: 'lsbf-modal-buttons' });

		this._btn(buttonRow, 'Update links', 'mod-cta', 'update');
		this._btn(buttonRow, 'Leave as is', '', 'leave');

		const secondRow = contentEl.createDiv({ cls: 'lsbf-modal-buttons lsbf-modal-buttons--secondary' });
		this._btn(secondRow, 'Always update', 'mod-warning', 'always');
		this._btn(secondRow, 'Never update', '', 'never');
	}

	onClose(): void {
		// If the modal is closed without a button press (e.g. Escape), treat as
		// 'leave' so the move still completes without changes.
		this.resolve('leave');
		this.contentEl.empty();
	}

	private _btn(
		container: HTMLElement,
		label: string,
		extraCls: string,
		choice: MoveChoice,
	): void {
		const btn = container.createEl('button', {
			text: label,
			cls: ['lsbf-modal-btn', extraCls].filter(Boolean).join(' '),
			attr: { 'aria-label': label },
		});
		btn.addEventListener('click', () => {
			this.resolve(choice);
			this.close();
		});
	}
}
