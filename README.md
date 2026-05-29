# Link Styles by Folder

Applies per-folder link style rules so notes in different parts of your vault automatically use the right link format — without you having to think about it.

## Why

Obsidian's link format settings are vault-wide. That works fine until you start composing vaults from multiple sources — for example, **Git submodules** for GitLab or GitHub wikis. Those wikis have their own link conventions (`[text](path)` style, specific path formats) that differ from your main vault. Managing the conflict by hand is friction that shouldn't exist.

This plugin lets each folder declare its own link style via a `.obsidian/app.json` file — the same file Obsidian already uses for per-folder config. Submodules that already have this file set up the way they need work automatically, with no extra configuration.

## Features

**Per-folder link style** — two settings become folder-scoped rather than vault-global:
- **Use `[[wikilinks]]`** vs. Markdown links (`[text](path)`)
- **New link format** — Shortest path, Relative path, or Absolute path

**Cascading rules** — settings merge up the folder tree; the deepest config wins per key. A submodule can override only the link type while inheriting the path format from the vault root, or vice versa.

**Automatic on insert** — the correct style is applied whenever you:
- Complete a `[[` link with Enter
- Use the *Add Internal Link* command

**Move handling** — when you move a note to a folder with a different style, the plugin can reformat its outgoing links to match. Configurable: ask every time, always update, or never update.

**Settings UI** — a dedicated settings panel shows the vault-root style (read-only), lets you view and edit every subfolder's rules via dropdowns, and provides an autocompleting input to add new folder rules without touching JSON.

## How it works

Place a `.obsidian/app.json` file in any subfolder with one or both of these keys:

```json
{
  "useMarkdownLinks": true,
  "newLinkFormat": "relative"
}
```

These are the same keys Obsidian uses in the vault-root `app.json`, so any submodule that already configures them is automatically respected. The plugin reads the chain of `app.json` files from the note's folder up to the vault root, using the deepest value found for each key, and falls back to Obsidian's own setting if a key appears nowhere.

> **Implementation note:** Obsidian exposes no public hook for customizing link generation per file, so the plugin wraps `app.fileManager.generateMarkdownLink` while it is loaded and restores the original on unload. As a result, this plugin may not interoperate cleanly with other plugins that wrap the same method.

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. In your vault, create the folder `.obsidian/plugins/link-styles-by-folder/`.
3. Copy the three files into that folder.
4. In Obsidian: **Settings → Community plugins** → disable Safe mode if prompted → enable **Link Styles by Folder**.

## Building from source

```bash
git clone https://github.com/mapipolo/obsidian-link-styles-by-folder
cd obsidian-link-styles-by-folder
npm install
npm run build   # outputs main.js
```

Use `npm run dev` for watch mode during development, and `npm test` to run the test suite.
