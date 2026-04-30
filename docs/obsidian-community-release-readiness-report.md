# Obsidian Community Release Readiness Report

Date: 2026-04-29

This report is based on the current repository state plus the current Obsidian release documentation:

- Submit your plugin
- Submission requirements for plugins
- Plugin guidelines
- Developer policies

Repository evidence was verified against these files and modules:

- manifest.json
- versions.json
- package.json
- package-lock.json
- README.md
- LICENSE
- main.js
- styles.css
- esbuild.config.mjs
- scripts/stage-plugin-dist.mjs
- scripts/sync-plugin-dist.mjs
- scripts/obsidian-plugin-path.mjs
- src/presentation/commands/registerCommands.ts
- src/application/config/PluginSettings.ts
- src/infrastructure/anki/AnkiConnectGateway.ts
- src/infrastructure/obsidian/ObsidianVaultGateway.ts
- src/infrastructure/obsidian/ObsidianPluginDataStore.ts

## 1. Current repository status

- The GitHub repository page at `panAtGitHub/AnkiHeadingSync` is publicly reachable.
- The GitHub repository currently shows no published releases, so the first submission release still needs to be created.
- No exact `anki-heading-sync` ID match and no exact `Anki Heading Sync` name match were found in the current upstream Obsidian community-plugins.json.
- manifest.json contains the expected release-facing fields: `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `authorUrl`, and `isDesktopOnly`.
- versions.json currently maps `1.0.1` to `1.8.7`, which matches manifest.json version and minAppVersion.
- package.json defines the release-relevant commands: `lint`, `test`, `build`, and `build:obsidian`.
- package-lock.json is present, and no yarn.lock was found.
- LICENSE is present and uses MIT.
- README.md is present and now documents purpose, setup, usage, disclosures, and troubleshooting.
- styles.css exists. It is intentionally empty, which is acceptable because the release pipeline still stages the file when present.
- esbuild.config.mjs builds the bundled plugin entry to `dist/plugin/main.js` and copies the production bundle back to the repository root as main.js.
- scripts/stage-plugin-dist.mjs stages manifest.json, versions.json, and styles.css into dist/plugin before bundling.
- scripts/sync-plugin-dist.mjs copies only `main.js`, `manifest.json`, and `styles.css` from dist/plugin into the local vault plugin directory.
- scripts/obsidian-plugin-path.mjs now supports `OBSIDIAN_PLUGIN_DIR` and otherwise falls back to a local default under the current user's home directory instead of a hardcoded absolute username path.
- src/presentation/commands/registerCommands.ts registers four commands and does not assign default hotkeys.
- src/application/config/PluginSettings.ts sets the default AnkiConnect URL to `http://127.0.0.1:8765`, enables include-scope by default, and declares the default card routes for basic, cloze, cloze-all, and QA Group.
- src/infrastructure/anki/AnkiConnectGateway.ts sends requests through Obsidian's requestUrl to the configured AnkiConnect URL.
- src/infrastructure/obsidian/ObsidianVaultGateway.ts uses `vault.process()` for Markdown write-back.
- src/infrastructure/obsidian/ObsidianPluginDataStore.ts uses `loadData()` and `saveData()` for plugin persistence.
- Local release validation on this branch is currently green: `npm run lint` passed, `npm test` passed with 312 tests across 35 files, and `npm run build` passed.
- After the build, dist/plugin contains `README.md`, `main.js`, `manifest.json`, `styles.css`, and `versions.json`.

## 2. Required Obsidian submission checklist

Based on the current Obsidian docs, the repository must satisfy these release conditions:

- Keep README.md, LICENSE, and manifest.json in the repository root.
- Use a manifest version in `x.y.z` format.
- Create a GitHub release whose tag exactly matches manifest.json `version`.
- Upload `main.js`, `manifest.json`, and optional `styles.css` as release assets.
- Keep manifest metadata aligned with the community-plugins.json submission entry.
- Keep description short, simple, and ending with a period.
- Ensure command IDs do not repeat the plugin ID prefix.
- Avoid default hotkeys.
- Use `isDesktopOnly: true` when the plugin is intentionally desktop-only.
- Clearly disclose network use in README.
- Clearly disclose Markdown write-back and any plugin data storage behavior in README.

## 3. What is already ready

- The GitHub repository is publicly reachable, which satisfies the source-availability expectation for review.
- The plugin ID and plugin name do not currently collide with an upstream community-plugins entry.
- Required root files exist: README.md, LICENSE, manifest.json, main.js, styles.css, versions.json.
- manifest.json metadata is internally consistent with versions.json.
- The manifest description is short, simple, and ends with a period.
- The plugin ID is `anki-heading-sync`, which does not contain `obsidian`.
- The command IDs in src/presentation/commands/registerCommands.ts do not duplicate the plugin ID.
- No default hotkeys are registered.
- Markdown file changes use `vault.process()` rather than a less safe background modify path.
- Plugin data persistence uses Obsidian plugin storage APIs.
- The build pipeline already produces the expected release files under dist/plugin.
- The vault sync script copies only the built plugin assets and does not target data.json.
- README now discloses local-network use, Markdown write-back, and plugin data persistence.

## 4. What still needs fixing

- A GitHub release for version `1.0.1` still needs to be created manually, with assets attached.
- Manual QA in real Obsidian and real Anki is still required before submission.
- The actual submission PR to obsidianmd/obsidian-releases still needs to be opened.

## 5. High-risk blockers

- If the GitHub repository is not public and reachable, the plugin cannot be reviewed.
- If the GitHub release tag does not exactly match `manifest.json.version`, Obsidian will not install the published release correctly.
- If live manual QA finds problems in AnkiConnect connectivity, marker write-back, or deck routing, submission should pause until they are fixed.

At the repository level, no code-path blocker was found in the files reviewed above.

## 6. Medium-risk improvements

- Root-level agent and internal workflow docs still mention a local vault path in non-runtime documentation. They are not used by the release scripts, but they remain visible in the public repository and may be worth pruning later.
- A short PR note explaining why the plugin is desktop-only would reduce reviewer back-and-forth, because the runtime path is centered on desktop Anki plus AnkiConnect.
- A short release-note template would make later version bumps less error-prone.

## 7. Low-risk polish

- Add screenshots or a short demo GIF later if you want a stronger first impression on GitHub. This is not required for Obsidian submission.
- Add a short CHANGELOG entry for the first public release if you want cleaner release notes. This is optional.

## 8. Manual QA checklist

Run these checks in a real desktop Obsidian vault with real Anki running:

- Enable the plugin in a clean vault.
- Open the settings tab once after first install.
- Confirm the default AnkiConnect URL is `http://127.0.0.1:8765`.
- Configure note types and field mappings.
- Run `Sync current file to Anki` on a file with a basic card.
- Run `Sync current file to Anki` on a file with `#anki-cloze` and `#anki-cloze-all` blocks.
- Run `Sync current file to Anki` on a file with a `#anki-list` QA Group block.
- Confirm `<!--ID: ...-->` and `<!--GI: ...-->` markers are written back as expected.
- Run `Sync vault to Anki` and confirm include or exclude scope behaves as configured.
- Verify deck routing with default deck, folder mapping, and file-level custom deck if you use them.
- Run `Clear synced cards in current file` and verify the file marker state is removed as expected.
- Run `Clean up empty decks` and confirm only still-empty decks are removed.
- Turn off or close Anki and confirm the user-facing error is understandable.
- Sanity-check both English and Chinese UI text if you ship both locales.

## 9. GitHub Release checklist

- Confirm manifest.json `version` is the release version you want to ship.
- Confirm versions.json contains the same version mapped to the correct minAppVersion.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Verify dist/plugin contains `main.js`, `manifest.json`, and `styles.css` when present.
- Create a GitHub release tag exactly matching `manifest.json.version`, currently `1.0.1`.
- Upload these assets to the release:
  - main.js
  - manifest.json
  - styles.css
- Download at least one release asset once to confirm the release is complete.

## 10. Obsidian Releases PR checklist

- Fork obsidianmd/obsidian-releases.
- Append a new entry to community-plugins.json using the exact manifest metadata.
- Use the current repo identifier `panAtGitHub/AnkiHeadingSync`.
- Open the PR in preview mode and select the Community Plugin checklist.
- Use the PR title `Add plugin: Anki Heading Sync`.
- Fill in the template checkboxes and reviewer notes before submitting.
- Wait for the automation result and only proceed when the PR shows a ready-for-review state.

## 11. Security/privacy disclosure checklist

README.md should continue to state all of the following clearly:

- The plugin talks to AnkiConnect through the configured URL.
- The default URL is local: `http://127.0.0.1:8765`.
- The plugin does not upload notes to a remote service by itself.
- The plugin modifies Markdown files to write sync markers and maintain note identity.
- Plugin settings and state are persisted through Obsidian plugin storage, which results in data being stored in the plugin data.json file.

Reviewer notes should also call out:

- desktop-only positioning
- AnkiConnect dependency
- local network request behavior
- Markdown marker write-back
- plugin data storage in data.json

## 12. Final go/no-go status

Current status: almost ready.

Repository-level release preparation is close to complete, but submission should wait until all of the following are true:

- local lint, test, and build validation remain green on the release branch
- manual QA is completed in real Obsidian and real Anki
- the GitHub release for version `1.0.1` exists with the correct assets
- the submission PR to obsidianmd/obsidian-releases is opened with the correct metadata
