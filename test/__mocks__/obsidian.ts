/**
 * Minimal stub for the `obsidian` module used in unit tests.
 * Only the subset needed by the modules under test is implemented.
 */

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		const parts = path.split('/');
		this.name = parts[parts.length - 1]!;
		const dotIdx = this.name.lastIndexOf('.');
		if (dotIdx >= 0) {
			this.basename = this.name.slice(0, dotIdx);
			this.extension = this.name.slice(dotIdx + 1);
		} else {
			this.basename = this.name;
			this.extension = '';
		}
	}
}

export class TFolder {
	path: string;
	name: string;
	constructor(path: string) {
		this.path = path;
		const parts = path.split('/');
		this.name = parts[parts.length - 1]!;
	}
}

// ── Stubs for modules not under test ─────────────────────────────────────────

export class Plugin {}
export class PluginSettingTab {}
export class Modal {
	contentEl: HTMLElement = document.createElement('div');
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
}
export class Setting {}
export class Notice {}
export abstract class AbstractInputSuggest<T> {
	constructor(public app: unknown, public inputEl: unknown) {}
	abstract getSuggestions(query: string): T[];
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T): void;
	close(): void {}
	setValue(_v: string): void {}
}
export class Events {
	on(_name: string, _cb: (...args: unknown[]) => unknown): unknown { return {}; }
	off(_name: string, _cb: (...args: unknown[]) => unknown): void {}
}
export class FileManager {}
