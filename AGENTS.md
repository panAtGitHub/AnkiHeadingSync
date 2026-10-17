# Repository Notes

## Obsidian Plugin Sync Target

After plugin changes, build and sync the runtime files for local debugging with `npm run build:obsidian`.

On the current Windows machine, use this exact plugin directory:

`C:\iWork\obsidian\.obsidian\plugins\anki-heading-sync`

On macOS, use this exact plugin directory:

`/Users/panxiaorong/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian/.obsidian/plugins/Anki Heading Sync`

Copy only the built plugin files (`main.js`, `manifest.json`, `styles.css`) into that directory. Do not delete or overwrite `data.json`.

## GitHub Release Assets

When creating or updating a GitHub release, upload the runtime plugin assets:

- `main.js`
- `manifest.json`
- `styles.css`

Also upload the example files from `dist/`:

- `dist/dead-sea-example.md`
- `dist/dead-sea-example.apkg`

The local Chinese-named example files duplicate the English `dead-sea-example.*` files. The English names are the ones referenced by `README.md`; keep only those two example assets attached to every release that includes downloadable assets.
