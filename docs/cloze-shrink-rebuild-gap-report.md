# Cloze Shrink Rebuild Gap Report

## Scope

This report records the actual repository state before implementing automatic note rebuild for sequential-to-all Cloze shrink.

## Current Cloze rendering path

- Heading recognition happens in `CardIndexingService.ts`.
- `#anki-cloze` indexes as runtime `cardType: "cloze"` with `clozeMode: "sequential"`.
- `#anki-cloze-all` indexes as runtime `cardType: "cloze"` with `clozeMode: "all"`.
- `ManualCardRenderer.ts` is the only place that currently applies automatic Cloze numbering.
- Current renderer behavior is:
  - explicit `{c2:内容}` preserves the explicit index
  - native `{{c2::内容}}` is left intact because the brace-based replacement does not rewrite it
  - automatic `{内容}` uses `c1/c2/c3/...` in sequential mode
  - automatic `{内容}` uses `c1/c1/c1/...` in all mode
  - `==highlight==` becomes brace-based Cloze input first when `convertHighlightsToCloze` is enabled
  - fenced code and inline code are protected before replacement
- `RenderConfigService.ts` already includes `clozeMode: "all"` in render hashing, so sequential-to-all already counts as rendered-output drift.

## Current state persistence behavior

- `CardState` in `PluginState.ts` does not contain `clozeMode`.
- `ManualSyncService.buildNextState()` writes `cardType`, render hash, deck, tags, and raw block data, but does not persist `clozeMode`.
- `DataJsonPluginStateRepository.ts` migrates only `basic` and `cloze` runtime card types and ignores any Cloze mode metadata because none exists yet.
- `FileIndexerService.restoreIndexedCard()` rebuilds `IndexedCard` from saved state for unchanged files, but currently drops `clozeMode` entirely.
- Result: once a Cloze card is restored from state instead of re-indexed from Markdown, mode information is lost.

## Current diff planning behavior

- `ManualSyncPlan.ts` currently has:
  - `toCreate`
  - `toUpdate`
  - `toVerifyDeck`
  - `toChangeDeck`
  - `toRewriteMarker`
  - `toOrphan`
- `DiffPlannerService.ts` only compares:
  - `rawBlockHash`
  - `renderConfigHash`
  - tag set
  - deck change
  - marker rewrite conditions
- There is no rebuild path.
- When sequential-to-all changes rendered output, the card simply enters `toUpdate` because render hash changed.
- There is no current comparison of old vs new final Cloze number sets.

## Current Anki execution behavior

- `AnkiBatchExecutor.ts` currently supports:
  - create via `addNotes`
  - update via `updateNotes`
  - note type migration via `updateNoteModel`
  - deck migration via `changeDecks`
  - marker rewrite via `markerWrites`
- Missing-note fallback already exists indirectly: when a planned update noteId is absent from fetched summaries, the executor adds a new note and marks it for marker rewrite.
- There is no rebuild queue and no create-then-delete flow for an existing note.
- `deleteNotes` exists on the gateway and fake gateway, but is currently unused by manual sync execution.
- `resolvedNoteIds` and `markerWrites` are already the right integration seam for replacing a noteId after a successful create.

## Current marker writeback behavior

- `MarkdownWriteBackService.ts` writes markers from `PlannedCard[]`.
- It uses the `noteId` present on each planned card at execution-result time.
- This means rebuild can reuse the current writeback path as long as execution returns the replacement `noteId` in `resolvedNoteIds` and marker writes for that sync key.

## Exact missing integration points

- Persist `clozeMode` on `CardState`.
- Load legacy state without `clozeMode` as sequential for runtime `cardType: "cloze"`.
- Restore `clozeMode` in `FileIndexerService.restoreIndexedCard()`.
- Add a pure helper that predicts the final Cloze number set from Markdown with the same counting rules the renderer uses.
- Extend `ManualSyncPlan` with `toRebuild`.
- Extend `DiffPlannerService` to detect sequential-to-all shrink only when the final number set becomes smaller.
- Extend `AnkiBatchExecutor` with create-then-delete rebuild handling and failure rollback.
- Persist rebuilt cards under the new noteId only.
- Expose rebuild count in execution/manual sync results if chosen.

## Risky failure paths

- If state persistence is not updated, unchanged-file restore will lose mode information and planner decisions will be inconsistent.
- If the Cloze number helper drifts from renderer behavior, planner may rebuild too often or miss rebuilds.
- If rebuild deletes the old note before create succeeds, the note can be lost.
- If create succeeds but delete fails and the new note is not best-effort cleaned up, duplicate notes can remain while local marker/state stays ambiguous.
- If rebuild cards are still allowed into `toUpdate`, `toChangeDeck`, or `toRewriteMarker`, the same sync key can be executed twice with conflicting noteIds.
