# Link Styles by Folder — Plugin Specification

## Summary

An Obsidian plugin that applies different link styles depending on the folder in which a note lives. Two of Obsidian's core link settings become per-folder rather than vault-global:

1. **"Use [[wikilinks]]"** — corresponds to `useMarkdownLinks` in `app.json` (`false` = wikilinks, `true` = Markdown links)
2. **"New link format"** — corresponds to `newLinkFormat` in `app.json` (`shortest` | `relative` | `absolute`)

## Motivation

Git submodules are useful for composing knowledge bases from disparate sources — e.g., GitLab wikis. GitLab wikis have their own link rules that differ from Obsidian's defaults. When those wikis live as submodules inside an Obsidian vault, the user should not have to think about which link style to use depending on context. The plugin handles it automatically.

## Configuration Format

The plugin reads `.obsidian/app.json` files at any depth in the vault, looking for two keys:

```json
{
  "useMarkdownLinks": false,
  "newLinkFormat": "shortest"
}
```

These are the same keys Obsidian already uses in its root-level `app.json`. Subdirectory `.obsidian/app.json` files are standard Obsidian per-folder config files; placing them in submodules requires no knowledge of this plugin.

## Cascade Rules

Settings resolve via a **merge-up cascade**:

1. Start at the folder containing the current file.
2. Walk upward toward the vault root, collecting every `.obsidian/app.json` found along the way.
3. For each of the two settings independently, use the value from the **deepest** (closest-to-file) config file that defines it.
4. If a setting is not found in *any* config file — including root — fall back to **Obsidian's live in-memory setting** for that key (i.e., whatever the user has set in Obsidian's own Settings → Files and links panel).

This means that a submodule can override only `useMarkdownLinks` while inheriting the vault-root value of `newLinkFormat`, and vice versa.

**The rules always apply based on the source file's location** — i.e., the folder containing the note where the outgoing link is being written.

## Behaviors

### 1. Inserting a new link

The plugin intercepts link insertion at two points and rewrites the inserted link to conform to the effective style for the source file:

- **"Add Internal Link" command** (command palette / hotkey)
- **`[[` autocomplete confirmed with Enter**

Links that already exist in a file and were inserted manually or by other means are left untouched.

### 2. Moving a note

When a note is moved from one folder to another where the effective link style differs, the plugin may reformat the outgoing links *inside that note* (i.e., links the note contains — not incoming links pointing to it).

This behavior is configurable in plugin settings:

| Option | Behavior |
|---|---|
| **Ask every time** | Show a dialog on each move (see below) |
| **Always update** | Silently reformat to destination style |
| **Never update** | Leave links unchanged; user manages manually |

**Move dialog** (shown when "Ask every time" is selected):

> **Update link styles?**
> This note is moving to a folder with a different link style.
> New style: **[[Wikilinks]]**, path format: **Shortest path**
>
> [ **Update links** ]  [ **Leave as is** ]  [ **Always update** ]  [ **Never update** ]

"Always update" and "Never update" save the preference to plugin settings and suppress future dialogs.

---

## Settings UI

The plugin adds a settings panel (Settings → Link Styles by Folder) with the following sections.

### Vault root (read-only)

Displays the current values of `useMarkdownLinks` and `newLinkFormat` as read from the root `.obsidian/app.json`. These are informational only — the plugin never writes to the root config file.

### Folder rules

A list of every folder that has a `.obsidian/app.json` containing one or both of the two managed settings. For each folder:

- **Folder path** — displayed relative to vault root
- **Use [[wikilinks]]** — dropdown: `Wikilinks` | `Markdown links` | *(Inherited)*
- **New link format** — dropdown: `Shortest path` | `Relative path` | `Absolute path` | *(Inherited)*

*Inherited* is shown (and selected) when the key is absent from that folder's config file. Choosing a value writes it to that folder's `.obsidian/app.json`. Clearing back to *Inherited* removes the key from the file.

Each folder path and the two dropdowns should be shown inline. The dropdowns use the same labels and order as Obsidian's own Settings → Files and links panel for consistency.

### Adding a new folder rule

A text input labeled **"Add folder rule"** accepts a vault-relative path (e.g., `posts/gitlab-wiki`). The input provides path autocomplete consistent with how folder paths are entered elsewhere in Obsidian settings. On confirm:

- If `.obsidian/app.json` already exists at that path, the file is opened for editing in the list above.
- If not, the plugin creates `<folder>/.obsidian/app.json` with an empty object `{}` and adds the folder to the list, where the user can then set values via the dropdowns.

The plugin can read and write `.obsidian/app.json` in any **non-root** folder. It never modifies the vault-root `.obsidian/app.json`.

### On move behavior

A dropdown selecting the default behavior when a note is moved between folders with different effective styles: **Ask every time** (default) | **Always update** | **Never update**.

## Edge Cases

| Scenario | Behavior |
|---|---|
| File is at vault root (no subfolder) | Uses vault-root `app.json` values, falling back to live settings |
| A `.obsidian/app.json` exists but omits one or both keys | Missing keys are treated as unset; cascade continues upward for those keys |
| File moves within the same effective-style scope | No dialog, no conversion |
| Link target file doesn't exist yet (new note via `[[`) | Style is still applied to the new link |
| User manually edits a link to a "wrong" style | Plugin does nothing; manual edits are not policed |
| A subfolder `.obsidian/app.json` is inside a git submodule | Plugin reads and writes it like any other non-root config — the submodule structure is transparent |

---

## Performance Considerations

Every link insertion triggers a walk up the directory tree to collect and merge config files. For deeply nested vaults or vaults with many submodules, this traversal cost may be noticeable. The implementation should consider **caching the resolved effective settings per folder**, invalidating entries when a `.obsidian/app.json` file is created, modified, or deleted (via Obsidian's file-watch events). Caching strategy and cache invalidation are left to the implementer.

## Design Rationale

Using `.obsidian/app.json` files as the config mechanism — rather than a standalone plugin config — has two advantages:

1. **No new file format.** The keys already exist in Obsidian's own schema.
2. **Submodule compatibility.** A submodule that already sets these keys in its own `.obsidian/app.json` will automatically be respected by the plugin without any additional setup. The submodule doesn't need to know this plugin exists.

An alternative design (plugin-specific config file) was rejected because it would provide no path to zero-configuration submodule support.

## Tests

All behaviors defined here should be covered by unit tests.

## Implementation

Use the Obsidian plugin skill to help write this.