# Pre-release Cleanup Decisions

## Scope behavior

- Keep defaults unchanged:
  - `scopeMode: "include"`
  - `includeFolders: []`
- New runtime rule:
  - if `scopeMode === "include"` and no folders are selected, both current-file sync and vault sync are blocked.
- User-facing message direction:
  - use explicit “run scope is not configured” messaging instead of generic out-of-scope or silent zero-file success.
- Settings page behavior:
  - show a visible warning inside the scope card when include mode is selected and no folder is checked.

## Semantic QA deletion scope

- Remove Semantic QA from:
  - runtime card-type unions
  - card-type config defaults and validation
  - legacy settings fields
  - field mapping types and validation branches
  - render-config resolution
  - card indexing match order and parser usage
  - parser source and parser tests
  - i18n messages
  - persistence tests that assert Semantic QA retention
  - settings tests and fake note-model fixtures
- Do not add any special migration UI.
- Old unknown Semantic QA fields in existing data are allowed to drop naturally through current normalization.

## Rebuild-index deletion scope

- Remove rebuild from:
  - plugin wiring
  - use case file
  - service method
  - notice summary method
  - i18n labels and failure text
  - tests asserting rebuild behavior
- Keep normal indexing services and diff planning intact because they are still used by ordinary sync.
- Retain only non-user-facing words like “rebuild” if they are unrelated to the removed command path; otherwise delete them.

## Writeback migration strategy

- Migrate `ObsidianVaultGateway.replaceMarkdownFile()` from:
  - `cachedRead + modify`
- To:
  - `vault.process(file, fn)`
- Conflict policy:
  - perform expected-content comparison inside the `process` callback.
  - throw the same conflict error when current content differs.
- Missing file policy:
  - preserve current `MarkdownFileNotFoundError` behavior before entering process.
- No-op writes:
  - return the current content unchanged if `nextContent === currentContent`.

## Settings debounce flush strategy

- Keep the existing 500ms debounce while the page is open.
- Replace timer-only cleanup on hide with a flush path:
  - cancel timers
  - immediately execute the last queued save action for each pending text field
  - await or safely chain those saves before teardown completes
- Prefer a centralized pending-save registry instead of field-specific hide logic.

## Release materials and metadata

- Add root `README.md` for future Obsidian community plugin submission readiness.
- Add root `LICENSE`.
- License choice:
  - use MIT because `package.json` already declares MIT and there is no repository evidence of a conflicting license strategy.
- Update `manifest.json`:
  - `author: "Dusk"`
  - `authorUrl: "https://github.com/panAtGitHub/AnkiHeadingSync"`
- Keep `isDesktopOnly: true`.
- Pin `devDependencies.obsidian` to `1.12.3` and update the lockfile.

## Intentionally retained references

- Historical audit documents under `docs/` that mention Semantic QA or rebuild are retained.
- Packaging behavior continues to copy only built plugin files into the Obsidian plugin directory.
- `versions.json` stays in staged package output because the current build pipeline already expects it, but sync-to-vault remains limited to runtime files only.

## Planned deviation handling

- If repository reality requires a narrower deletion than the attached plan, prefer preserving active basic/cloze/qa-group behavior over aggressive cleanup.
- At review time, no deviation is required yet; the current repository structure matches the plan closely enough to implement directly.
