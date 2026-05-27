import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { reformatAllLinks } from '../src/link-reformatter';
import type { ResolvedConfig } from '../src/config-resolver';

// ── Helpers ───────────────────────────────────────────────────────────────────

function file(path: string): TFile { return new TFile(path); }

type GetFirstLinkpathDest = (linkpath: string, sourcePath: string) => TFile | null;

/**
 * Build a minimal App mock.  `resolve` is a simple lookup: link text → TFile.
 * Returning null simulates an unresolvable (broken) link.
 */
function makeApp(resolveMap: Record<string, TFile> = {}): App {
	const getFirstLinkpathDest = vi.fn<Parameters<GetFirstLinkpathDest>, TFile | null>(
		(linkpath: string) => resolveMap[linkpath] ?? null,
	);
	return {
		vault: {
			getFiles: () => Object.values(resolveMap),
		},
		metadataCache: { getFirstLinkpathDest },
	} as unknown as App;
}

const SOURCE = 'notes/source.md';

function cfg(useMarkdownLinks: boolean, newLinkFormat: ResolvedConfig['newLinkFormat']): ResolvedConfig {
	return { useMarkdownLinks, newLinkFormat };
}

// ── Wikilinks → Markdown links ────────────────────────────────────────────────

describe('reformatAllLinks – wikilink → markdown', () => {
	const target = file('notes/target.md');
	const app = makeApp({ target: target });
	const toMarkdown = cfg(true, 'shortest');

	it('converts a plain wikilink', () => {
		expect(reformatAllLinks(app, '[[target]]', SOURCE, toMarkdown))
			.toBe('[target](target)');
	});

	it('preserves the alias as display text', () => {
		expect(reformatAllLinks(app, '[[target|My Title]]', SOURCE, toMarkdown))
			.toBe('[My Title](target)');
	});

	it('preserves the heading anchor', () => {
		expect(reformatAllLinks(app, '[[target#Introduction]]', SOURCE, toMarkdown))
			.toBe('[target](target#Introduction)');
	});

	it('preserves alias and heading together', () => {
		expect(reformatAllLinks(app, '[[target#Intro|Intro]]', SOURCE, toMarkdown))
			.toBe('[Intro](target#Intro)');
	});

	it('leaves an unresolvable wikilink untouched', () => {
		expect(reformatAllLinks(app, '[[no-such-note]]', SOURCE, toMarkdown))
			.toBe('[[no-such-note]]');
	});

	it('converts multiple wikilinks in one pass', () => {
		const b = file('notes/b.md');
		const app2 = makeApp({ target: target, b });
		const input = '[[target]] and [[b]]';
		expect(reformatAllLinks(app2, input, SOURCE, toMarkdown))
			.toBe('[target](target) and [b](b)');
	});
});

// ── Markdown links → Wikilinks ────────────────────────────────────────────────

describe('reformatAllLinks – markdown → wikilink', () => {
	const target = file('notes/target.md');
	const app = makeApp({ 'notes/target': target });
	const toWiki = cfg(false, 'absolute');

	it('converts a plain markdown link', () => {
		// resolveMap key must match what getFirstLinkpathDest is called with
		const a2 = makeApp({ target: target });
		expect(reformatAllLinks(a2, '[target](target)', SOURCE, cfg(false, 'shortest')))
			.toBe('[[target]]');
	});

	it('preserves the alias', () => {
		const a2 = makeApp({ target: target });
		expect(reformatAllLinks(a2, '[My Title](target)', SOURCE, cfg(false, 'shortest')))
			.toBe('[[target|My Title]]');
	});

	it('preserves the heading anchor', () => {
		const a2 = makeApp({ target: target });
		expect(reformatAllLinks(a2, '[target](target#section)', SOURCE, cfg(false, 'shortest')))
			.toBe('[[target#section]]');
	});

	it('uses absolute path format when configured', () => {
		const a2 = makeApp({ 'notes/target': target });
		expect(reformatAllLinks(a2, '[target](notes/target)', SOURCE, toWiki))
			.toBe('[[notes/target]]');
	});
});

// ── External URLs and unresolvable links ──────────────────────────────────────

describe('reformatAllLinks – pass-throughs', () => {
	const app = makeApp(); // no resolved files

	it('leaves https:// links unchanged', () => {
		const input = '[Google](https://google.com)';
		expect(reformatAllLinks(app, input, SOURCE, cfg(true, 'shortest')))
			.toBe(input);
	});

	it('leaves http:// links unchanged', () => {
		const input = '[Site](http://example.com/page)';
		expect(reformatAllLinks(app, input, SOURCE, cfg(true, 'shortest')))
			.toBe(input);
	});

	it('leaves unresolvable markdown links unchanged', () => {
		const input = '[broken](some/nonexistent-file)';
		expect(reformatAllLinks(app, input, SOURCE, cfg(true, 'shortest')))
			.toBe(input);
	});

	it('leaves unresolvable wikilinks unchanged', () => {
		expect(reformatAllLinks(app, '[[ghost]]', SOURCE, cfg(false, 'shortest')))
			.toBe('[[ghost]]');
	});

	it('does not modify plain text', () => {
		const text = 'Just some text without any links.';
		expect(reformatAllLinks(app, text, SOURCE, cfg(false, 'shortest'))).toBe(text);
	});
});

// ── Path format in reformatted links ─────────────────────────────────────────

describe('reformatAllLinks – path format', () => {
	const target = file('notes/target.md');
	const app = makeApp({ target });

	it('uses relative path format', () => {
		const result = reformatAllLinks(app, '[[target]]', SOURCE, cfg(true, 'relative'));
		expect(result).toBe('[target](./target)');
	});

	it('uses absolute path format', () => {
		const result = reformatAllLinks(app, '[[target]]', SOURCE, cfg(true, 'absolute'));
		expect(result).toBe('[target](notes/target)');
	});

	it('uses shortest path format', () => {
		const result = reformatAllLinks(app, '[[target]]', SOURCE, cfg(true, 'shortest'));
		expect(result).toBe('[target](target)');
	});
});

// ── Mixed content ─────────────────────────────────────────────────────────────

describe('reformatAllLinks – mixed content', () => {
	it('reformats only internal links, leaving surrounding prose intact', () => {
		const target = file('notes/target.md');
		const app = makeApp({ target });
		const input = 'See [[target]] for details.\nAlso [Google](https://google.com).';
		const result = reformatAllLinks(app, input, SOURCE, cfg(true, 'shortest'));
		expect(result).toBe('See [target](target) for details.\nAlso [Google](https://google.com).');
	});

	it('handles wikilinks and markdown links in the same file', () => {
		const a = file('notes/a.md');
		const b = file('notes/b.md');
		const app = makeApp({ a, b });
		const input = '[[a]] and [b](b)';
		const result = reformatAllLinks(app, input, SOURCE, cfg(true, 'shortest'));
		expect(result).toBe('[a](a) and [b](b)');
	});
});
