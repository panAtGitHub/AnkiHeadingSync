# Obsidian Community Release Checklist

## Final local validation

- Confirm manifest.json `id`, `name`, `version`, `description`, `author`, `authorUrl`, `minAppVersion`, and `isDesktopOnly` are correct.
- Confirm versions.json maps the release version to the correct minAppVersion.
- Confirm README.md and LICENSE are present in the repository root.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Verify dist/plugin contains `main.js`, `manifest.json`, and `styles.css` when present.

## Version and release

- If needed, bump manifest.json `version` in `x.y.z` format.
- Update versions.json with the same version key and the correct minAppVersion value.
- Create a GitHub release tag that exactly matches manifest.json `version`.
- Upload these release assets:
  - main.js
  - manifest.json
  - styles.css
- Download the uploaded assets once to verify the release is usable.

## Local vault sync for final smoke test

- Optionally run `npm run build:obsidian` for a local smoke test.
- If you need a custom vault target, set `OBSIDIAN_PLUGIN_DIR` before running the command.
- Confirm the sync step copied only plugin assets and did not overwrite data.json.

## Manual QA before submission

- Enable the plugin in a desktop Obsidian vault.
- Open the plugin settings page.
- Confirm AnkiConnect works at the configured URL.
- Verify basic Q&A sync.
- Verify `#anki-cloze` sync.
- Verify `#anki-cloze-all` sync.
- Verify `#anki-list` QA Group sync.
- Verify marker write-back for `<!--ID: ...-->` and `<!--GI: ...-->`.
- Verify scope handling for current-file sync and vault sync.
- Verify deck behavior with default deck and any overrides you use.
- Verify `Clear synced cards in current file`.
- Verify `Clean up empty decks`.
- Verify error messaging when Anki is closed.

## Obsidian Releases PR

- Fork obsidianmd/obsidian-releases.
- Append the plugin entry to community-plugins.json.
- Use the exact repository identifier `panAtGitHub/AnkiHeadingSync`.
- Open a PR titled `Add plugin: Anki Heading Sync`.
- In preview mode, choose the Community Plugin checklist.
- Fill in the PR template and reviewer notes.

## Reviewer notes to include

- The plugin is desktop-only.
- The plugin depends on AnkiConnect.
- Network requests go only to the configured AnkiConnect URL, default `http://127.0.0.1:8765`.
- The plugin writes sync markers back into Markdown files.
- Plugin settings and sync state are stored in the plugin data.json file.
