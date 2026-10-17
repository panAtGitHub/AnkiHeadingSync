# Build Workflow

`npm run build` builds the production plugin package into `dist/plugin/` and updates the repository's `main.js`.

After plugin changes, run `npm run build:obsidian` to build and copy the runtime files into the local Obsidian vault for debugging.

Default plugin directories:

- Windows: `C:\iWork\obsidian\.obsidian\plugins\anki-heading-sync`
- macOS: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian/.obsidian/plugins/Anki Heading Sync`

Set `OBSIDIAN_PLUGIN_DIR` to override the target with a full plugin directory path.

The sync only copies these files from `dist/plugin/`:

- `main.js`
- `manifest.json`
- `styles.css` (when present)

The sync does not delete or overwrite `data.json`. Reload the plugin or restart Obsidian after syncing to load the updated code.
