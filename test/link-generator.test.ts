import { describe, it, expect } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { generateLink } from '../src/link-generator';
import type { ResolvedConfig } from '../src/config-resolver';

// ── Helpers ───────────────────────────────────────────────────────────────────

function file(path: string): TFile { return new TFile(path); }

function makeApp(files: TFile[]): App {
	return {
		vault: { getFiles: () => files },
	} as unknown as App;
}

function cfg(useMarkdownLinks: boolean, newLinkFormat: ResolvedConfig['newLinkFormat']): ResolvedConfig {
	return { useMarkdownLinks, newLinkFormat };
}

// Source file path used in most tests
const SOURCE = 'notes/source.md';

// ── [[Wikilink]] output ───────────────────────────────────────────────────────

describe('generateLink – wikilinks', () => {
	describe('shortest path', () => {
		it('uses bare filename when the target basename is unique', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'shortest')))
				.toBe('[[target]]');
		});

		it('falls back to full path when the basename is not unique', () => {
			const target = file('notes/target.md');
			const duplicate = file('other/target.md');
			const app = makeApp([target, duplicate]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'shortest')))
				.toBe('[[notes/target]]');
		});

		it('omits the .md extension', () => {
			const target = file('notes/my-note.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'shortest')))
				.toBe('[[my-note]]');
		});

		it('keeps the extension for non-.md files', () => {
			const target = file('assets/diagram.png');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'shortest')))
				.toBe('[[diagram.png]]');
		});
	});

	describe('absolute path', () => {
		it('uses the full vault path without extension for .md files', () => {
			const target = file('deep/nested/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'absolute')))
				.toBe('[[deep/nested/target]]');
		});
	});

	describe('relative path', () => {
		it('uses ./ prefix for files in the same directory', () => {
			const target = file('notes/sibling.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'relative')))
				.toBe('[[./sibling]]');
		});

		it('uses ../ to go up one level', () => {
			const target = file('other/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'relative')))
				.toBe('[[../other/target]]');
		});

		it('goes up multiple levels', () => {
			const src = 'a/b/c/note.md';
			const target = file('other.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, src, undefined, undefined, cfg(false, 'relative')))
				.toBe('[[../../../other]]');
		});

		it('descends into a child folder', () => {
			const target = file('notes/sub/child.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(false, 'relative')))
				.toBe('[[./sub/child]]');
		});

		it('handles source at vault root', () => {
			const target = file('posts/entry.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, 'root-note.md', undefined, undefined, cfg(false, 'relative')))
				.toBe('[[./posts/entry]]');
		});
	});

	describe('alias and subpath', () => {
		it('appends |alias when alias is provided', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, 'My Target', cfg(false, 'shortest')))
				.toBe('[[target|My Target]]');
		});

		it('appends subpath (#heading) after the target path', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, '#Introduction', undefined, cfg(false, 'shortest')))
				.toBe('[[target#Introduction]]');
		});

		it('appends both subpath and alias in correct order', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, '#Intro', 'Intro Section', cfg(false, 'shortest')))
				.toBe('[[target#Intro|Intro Section]]');
		});
	});
});

// ── [Markdown link](path) output ──────────────────────────────────────────────

describe('generateLink – markdown links', () => {
	describe('shortest path', () => {
		it('produces [alias](path) with basename as default alias', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'shortest')))
				.toBe('[target](target)');
		});

		it('uses full path for non-unique basenames', () => {
			const target = file('notes/target.md');
			const app = makeApp([target, file('other/target.md')]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'shortest')))
				.toBe('[target](notes/target)');
		});
	});

	describe('absolute path', () => {
		it('uses the full vault path', () => {
			const target = file('deep/nested/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'absolute')))
				.toBe('[target](deep/nested/target)');
		});
	});

	describe('relative path', () => {
		it('uses ./ for same directory', () => {
			const target = file('notes/sibling.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'relative')))
				.toBe('[sibling](./sibling)');
		});

		it('uses ../ to go up', () => {
			const target = file('other/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'relative')))
				.toBe('[target](../other/target)');
		});
	});

	describe('alias and subpath', () => {
		it('uses provided alias as the display text', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, 'Custom Title', cfg(true, 'shortest')))
				.toBe('[Custom Title](target)');
		});

		it('appends #anchor to the path', () => {
			const target = file('notes/target.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, '#section', undefined, cfg(true, 'shortest')))
				.toBe('[target](target#section)');
		});

		it('encodes spaces in the path', () => {
			const target = file('notes/my note.md');
			const app = makeApp([target]);
			expect(generateLink(app, target, SOURCE, undefined, undefined, cfg(true, 'shortest')))
				.toBe('[my note](my%20note)');
		});
	});
});
