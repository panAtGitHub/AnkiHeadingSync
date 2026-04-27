# Anki Heading Sync

Anki Heading Sync is an Obsidian desktop plugin for syncing Markdown heading blocks into Anki with a focused, file-first workflow.

## Features

- Sync basic Q&A cards from heading blocks
- Sync cloze cards from heading blocks with cloze-specific recognition
- Sync QA Group list blocks into multi-level list QA notes
- Sync the current file or all in-scope files in the vault
- Write Anki IDs and GI markers back into Markdown after sync
- Support deck routing, Obsidian backlinks, tag sync, and current-file reset

## Requirements

- Obsidian desktop 1.5.0 or newer
- Anki with AnkiConnect enabled

## Commands

- Sync current file to Anki
- Sync vault to Anki
- Clear synced cards in current file
- Clean up empty decks

## Development

```bash
npm install
npm run lint
npm run test
npm run build
```

Release assets should include `main.js`, `manifest.json`, and `styles.css`.
