# Anki Heading Sync

Anki Heading Sync is an Obsidian desktop plugin that syncs Markdown heading blocks into Anki through a file-first workflow.

It is designed for users who want to keep note authoring in Obsidian, push selected heading blocks to Anki, and let the plugin write stable sync markers back into the same Markdown files.

## What the plugin supports

- Basic Q&A cards from heading blocks
- Cloze cards with the sequential marker route `#anki-cloze`
- Cloze-all cards with the all-in-one marker route `#anki-cloze-all`
- QA Group list notes with the group marker route `#anki-list`
- Syncing either the current file or all files inside the configured vault scope
- Deck routing through default deck, folder mapping, and optional file-level custom deck
- Optional Obsidian backlinks and tag sync
- Clearing synced markers in the current file and cleaning up empty decks in Anki

## Requirements

- Obsidian desktop 1.5.0 or newer
- Anki desktop
- AnkiConnect enabled in Anki

This plugin is desktop-only. It talks to the configured AnkiConnect URL, which defaults to `http://127.0.0.1:8765`.

The plugin does not upload your notes to a remote service by itself. Network requests are sent only to the AnkiConnect URL you configure in the plugin settings.

## Install

### Community Plugins

Once the plugin is accepted into the Obsidian Community Plugins directory, install it from Obsidian's Community Plugins browser.

### Manual install from a release

1. Download the release assets for the version you want.
2. Create or open your vault plugin folder: `.obsidian/plugins/anki-heading-sync`.
3. Copy these release assets into that folder:
	 - `main.js`
	 - `manifest.json`
	 - `styles.css` when present
4. Enable Anki Heading Sync in Obsidian.

## AnkiConnect setup

1. Open Anki on your desktop.
2. Install and enable the AnkiConnect add-on in Anki.
3. Restart Anki after installing the add-on.
4. In Obsidian, open Settings -> Community plugins -> Anki Heading Sync.
5. Keep the default AnkiConnect URL `http://127.0.0.1:8765` unless you intentionally expose AnkiConnect on another address.
6. Confirm that Anki is running before you start a sync.

## Initial plugin setup

### 1. Choose note types and field mappings

Open the plugin settings and configure the note types and field mappings used by the routes you want to sync.

- Basic cards use the basic route.
- Cloze and cloze-all use the cloze routes.
- QA Group uses the dedicated group route.

If you change note model fields in Anki later, revisit the plugin settings and refresh the mappings before syncing again.

### 2. Configure sync scope

Vault sync uses the configured run scope.

- `all`: sync every Markdown file the plugin can index
- `include`: sync only the folders listed in `includeFolders`
- `exclude`: sync everything except the folders listed in `excludeFolders`

If `include` mode is selected and the include list is empty, vault sync has no in-scope files to process.

### 3. Configure deck behavior

Set a default deck first. You can then optionally add folder-based deck routing and file-level custom deck declarations.

Current deck priority is:

1. File-level custom deck
2. Folder mapping deck
3. Default deck

## Commands

- `Sync current file to Anki`
- `Sync vault to Anki`
- `Clear synced cards in current file`
- `Clean up empty decks`

The plugin registers these commands without default hotkeys so they do not override user shortcuts.

## Supported Markdown patterns

### Basic Q&A

By default, a plain H4 heading block is treated as a basic card.

```md
#### Capital of France
Paris
```

### Cloze, sequential route

Use the cloze marker on the heading. Native Anki cloze syntax is preserved.

```md
#### Atomic structure #anki-cloze
Electrons orbit the {{c1::nucleus}}.
```

### Cloze, all route

Use the cloze-all marker on the heading when all generated clozes in the block should share the same deletion index.

```md
#### Key ideas #anki-cloze-all
{Alpha} and {Beta} are reviewed together.
```

### QA Group list note

Use the QA Group marker on the heading. The whole heading block syncs as one QA Group note.

```md
#### Concepts #anki-list
- Alpha
	- First answer
- Beta
	- Second answer
```

### Multi-level list QA example

Nested content under the answer bullet stays inside the answer region.

```md
#### Physics laws #anki-list
- Newton's first law
	- An object remains at rest or in uniform motion.
		- Unless a net external force acts on it.
- Newton's second law
	- Force equals mass times acceleration.
```

## Marker write-back

After a successful sync, the plugin writes sync markers back into the Markdown file.

- Single-card routes write an Anki note marker such as `<!--ID: 41-->`
- QA Group routes write a group marker such as `<!--GI:n=42;i=item_a:1,item_b:2;f=3,4,5,6,7,8,9,10,11,12-->`

The plugin writes these markers into the Markdown file so later syncs can update the existing Anki notes instead of creating duplicates.

The `Clear synced cards in current file` command removes synced marker state from the current file so you can intentionally recreate notes.

## Answer cutoff behavior

The plugin supports two answer cutoff modes.

- `heading-block`: keep the entire heading block as card content unless a valid sync marker is present
- `double-blank-lines`: stop before the first run of 2 or more blank lines unless a valid sync marker is present

If a valid `<!--ID: ...-->` or `<!--GI: ...-->` marker already exists, that marker takes precedence over the blank-line cutoff.

## Privacy and local-network behavior

- The plugin sends requests only to the configured AnkiConnect URL.
- The default URL is local: `http://127.0.0.1:8765`.
- The plugin modifies Markdown files in your vault to write sync markers and maintain note identity.
- Plugin settings and state are stored through Obsidian plugin data storage, which results in plugin data being persisted in the plugin `data.json` file.

## Troubleshooting

### Anki is not open

Open Anki first, then run the sync command again. The plugin cannot sync while AnkiConnect is unavailable.

### AnkiConnect is not installed or not responding

Confirm that AnkiConnect is installed in Anki, restart Anki, and verify the plugin's AnkiConnect URL setting.

### Field mapping is stale

If you changed note fields or note types in Anki, revisit the plugin settings and remap the fields before syncing again.

### Deck routing is not what you expected

Check the deck priority order: file-level custom deck overrides folder mapping, and folder mapping overrides the default deck.

### Vault sync does not pick up any files

Check the sync scope settings. In `include` mode, an empty include list means there are no in-scope files.

### You want to recreate old notes instead of updating them

Use `Clear synced cards in current file` to remove the current file's sync markers, then sync again.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

To build and sync the bundled plugin into a local vault during development, set `OBSIDIAN_PLUGIN_DIR` if you want to override the default local target path:

```bash
OBSIDIAN_PLUGIN_DIR="/absolute/path/to/.obsidian/plugins/Anki Heading Sync" npm run build:obsidian
```

The vault sync step copies only the built plugin assets and does not overwrite `data.json`.

## Release assets

GitHub release assets for Obsidian should include:

- `main.js`
- `manifest.json`
- `styles.css` when present
