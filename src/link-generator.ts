import { App, TFile } from 'obsidian';
import { LinkFormat, ResolvedConfig } from './config-resolver';

/**
 * Generates a link string (wikilink or markdown) for a given target file,
 * using the effective per-folder settings rather than Obsidian's vault-global
 * settings.  This is a pure replacement for app.fileManager.generateMarkdownLink.
 */
export function generateLink(
	app: App,
	file: TFile,
	sourcePath: string,
	subpath: string | undefined,
	alias: string | undefined,
	config: ResolvedConfig,
): string {
	const linkPath = computePath(app, file, sourcePath, config.newLinkFormat);
	const subpathStr = subpath ?? '';

	if (!config.useMarkdownLinks) {
		// [[wikilink]] format
		// For .md files Obsidian omits the extension in wikilinks.
		const inner = linkPath + subpathStr + (alias ? `|${alias}` : '');
		return `[[${inner}]]`;
	} else {
		// [alias](path) format
		const display = alias ?? (file.extension === 'md' ? file.basename : file.name);
		const encodedPath = encodeInternalPath(linkPath);
		return `[${display}](${encodedPath}${subpathStr})`;
	}
}

// ─── Path computation ─────────────────────────────────────────────────────────

function computePath(
	app: App,
	file: TFile,
	sourcePath: string,
	format: LinkFormat,
): string {
	// For .md files the extension is conventionally omitted.
	const fileLinkPath = file.extension === 'md' ? file.path.slice(0, -3) : file.path;

	switch (format) {
		case 'absolute':
			return fileLinkPath;

		case 'shortest': {
			const basename = file.extension === 'md' ? file.basename : file.name;
			const duplicates = app.vault
				.getFiles()
				.filter((f) => (f.extension === 'md' ? f.basename : f.name) === basename);
			return duplicates.length === 1 ? basename : fileLinkPath;
		}

		case 'relative': {
			const sourceDir = sourcePath.includes('/')
				? sourcePath.split('/').slice(0, -1).join('/')
				: '';
			return computeRelativePath(sourceDir, fileLinkPath);
		}
	}
}

/**
 * Computes a relative path from fromDir to toPath.
 * Both arguments use forward slashes; '' means vault root.
 */
function computeRelativePath(fromDir: string, toPath: string): string {
	const fromParts = fromDir ? fromDir.split('/') : [];
	const toParts = toPath.split('/');

	// Common prefix length (only check directory components of toPath).
	let commonLen = 0;
	while (
		commonLen < fromParts.length &&
		commonLen < toParts.length - 1 &&
		fromParts[commonLen] === toParts[commonLen]
	) {
		commonLen++;
	}

	const upCount = fromParts.length - commonLen;
	const downParts = toParts.slice(commonLen);

	const segments = [...Array<string>(upCount).fill('..'), ...downParts];
	const joined = segments.join('/');

	// Prefix ./ for same-level or deeper paths so they're unambiguous.
	return upCount === 0 && segments.length > 0 ? './' + joined : joined;
}

/** Encodes a vault-internal path for use inside a markdown link `()`. */
function encodeInternalPath(path: string): string {
	// Encode each segment but preserve separators and dots.
	return path
		.split('/')
		.map((seg) => seg.replace(/ /g, '%20'))
		.join('/');
}
