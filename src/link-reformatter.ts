import { App } from 'obsidian';
import { ResolvedConfig } from './config-resolver';
import { generateLink } from './link-generator';

/**
 * Regex for wikilinks: [[target]], [[target#heading]], [[target|alias]],
 * [[target#heading|alias]].
 *
 * Groups: 1=target  2=heading (with #)  3=alias (without |)
 */
const WIKILINK_RE =
	/\[\[([^\]|#\n]+?)(?:(#[^\]|\n]+?))?(?:\|([^\]\n]+?))?\]\]/g;

/**
 * Regex for internal markdown links: [alias](path) and [alias](path#anchor).
 * External URLs (containing ://) are excluded.
 *
 * Groups: 1=alias  2=path  3=anchor (with #)
 */
const MD_LINK_RE = /\[([^\]\n]*)\]\((?!(?:[a-zA-Z][a-zA-Z\d+\-.]*:\/\/))([^)#\n]+?)(#[^)\n]*)?\)/g;

/**
 * Rewrites every resolvable internal link in `content` to use `newConfig`'s
 * link style.  Links that cannot be resolved to a vault file are left
 * unchanged (e.g. external URLs, broken links).
 *
 * ⚠️  Links inside fenced code blocks or inline code are not excluded in this
 *     implementation; that's a known limitation for the initial release.
 *
 * @param sourceFilePath  The new (post-move) path of the file — used for
 *                        relative-path calculation.
 */
export function reformatAllLinks(
	app: App,
	content: string,
	sourceFilePath: string,
	newConfig: ResolvedConfig,
): string {
	let result = content;

	result = result.replace(
		WIKILINK_RE,
		(match, target: string, heading: string | undefined, alias: string | undefined) => {
			const targetFile = app.metadataCache.getFirstLinkpathDest(target.trim(), sourceFilePath);
			if (!targetFile) return match;

			return generateLink(
				app,
				targetFile,
				sourceFilePath,
				heading, // includes the '#'
				alias?.trim() || undefined,
				newConfig,
			);
		},
	);

	result = result.replace(
		MD_LINK_RE,
		(match, alias: string, target: string, anchor: string | undefined) => {
			const decoded = decodeURIComponent(target.trim());
			const targetFile = app.metadataCache.getFirstLinkpathDest(decoded, sourceFilePath);
			if (!targetFile) return match;

			return generateLink(
				app,
				targetFile,
				sourceFilePath,
				anchor, // includes the '#'
				alias || undefined,
				newConfig,
			);
		},
	);

	return result;
}
