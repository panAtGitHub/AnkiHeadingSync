# Pre-release Remaining Fixes Gap Report

## Scope

This report records the real repository state on 2026-04-27 before implementing the remaining pre-release fixes.

## Pending writeback load behavior

- Runtime state shape already defines modern `PendingWriteBackState` in `src/domain/manual-sync/entities/PluginState.ts` with:
  - `filePath`
  - `blockStartLine`
  - `expectedFileHash`
  - `targetMarker`
  - `rawBlockHash`
  - `targetNoteId`
  - optional `markerKind`
  - optional `targetGroupId`
- `src/application/services/MarkdownWriteBackService.ts` already emits modern pending entries for both:
  - card ID marker writes with `markerKind: "card-id"`
  - group GI writes with `markerKind: "group-gi"` and `targetGroupId`
- `src/infrastructure/persistence/DataJsonPluginStateRepository.ts` currently drops all persisted pending entries on load by returning `pendingWriteBack: []` from `migratePluginState()`.
- Result:
  - writeback conflicts are persisted during a session
  - after Obsidian restart, the recovery queue is lost

## Malformed and legacy pending handling

- `DataJsonPluginStateRepository.ts` declares `LegacyPendingWriteBackState`, but current load migration does not validate or preserve any pending items.
- Current repository behavior therefore treats all pending shapes the same way:
  - valid modern items are dropped
  - malformed items are dropped
  - legacy `cardId` / `noteId` only items are dropped
- There is currently no explicit validation contract for pending items during load.

## Old Semantic QA state behavior

- `DataJsonPluginStateRepository.ts` still migrates every loaded card through `migrateCardState()`.
- `sanitizeCardType()` currently keeps `"cloze"` and converts every other value to `"basic"`.
- Result:
  - removed `semantic-qa` cards are silently converted to `basic`
  - converted cards remain in `state.cards`
  - converted cards still contribute note IDs to `files[*].noteIds` through `collectMigratedFileNoteIds()`
- Current test coverage in `src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts` explicitly asserts this silent conversion.

## Release link status

- `manifest.json` currently has:
  - `author: "Dusk"`
  - `authorUrl: "https://github.com/panAtGitHub"`
- Required repository link is not yet applied.

## README wording status

- `README.md` still says:
  - `Sync QA Group list blocks into managed group notes`
- This is stale product language relative to the current user-facing route.

## i18n legacy wording status

- Active user-facing wording in `src/presentation/i18n/messages/en.ts` and `src/presentation/i18n/messages/zh.ts` still includes:
  - `QA Group 12`
  - `ObsiAnki QA Group 12`
  - `Managed note type`
  - `Managed model contract`
  - `托管笔记类型`
  - `托管模型约束`
- These messages are still part of the live settings UI.
- Current active text suggests a fixed managed-model narrative that does not match the intended release wording.

## Build and sync script status

- `scripts/stage-plugin-dist.mjs` stages:
  - `manifest.json`
  - `versions.json`
  - optional `styles.css`
  - generated package `README.md`
- `scripts/sync-plugin-dist.mjs` copies from `dist/plugin`:
  - `main.js`
  - `manifest.json`
  - optional `styles.css`
- The generic sync script does not delete `data.json`, but repository instructions still require strict file selection during final vault sync.

## Exact files likely to change

- `src/infrastructure/persistence/DataJsonPluginStateRepository.ts`
- `src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts`
- `manifest.json`
- `README.md`
- `src/presentation/i18n/messages/en.ts`
- `src/presentation/i18n/messages/zh.ts`
