# Build Workflow

`npm run build` deploys the production plugin package directly into the local Obsidian plugin directory:

- `/Users/panxiaorong/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian/.obsidian/plugins/Anki Heading Sync`

The build only overwrites plugin package files:

- `main.js`
- `manifest.json`
- `versions.json`
- `README.md`

The build does not delete or overwrite `data.json`.

This path is intentionally hard-coded for this machine and is not a portable multi-machine build configuration.
