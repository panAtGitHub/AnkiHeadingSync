# Cloze Shrink Rebuild Decisions

## Cloze mode persistence strategy

- Add `clozeMode?: "sequential" | "all"` to `CardState`.
- `ManualSyncService.buildNextState()` persists the current indexed card mode.
- `DataJsonPluginStateRepository` loads missing Cloze mode as:
  - `"sequential"` when `cardType === "cloze"`
  - `undefined` otherwise
- `FileIndexerService.restoreIndexedCard()` restores persisted `clozeMode` so unchanged-file paths keep mode fidelity.
- No marker-text inference is required for v1 because runtime `cardType: "cloze"` plus missing mode already safely defaults to sequential.

## Cloze number collection strategy

- Add a pure helper that predicts the final Anki Cloze number set from Markdown body content.
- The helper must follow renderer semantics for:
  - highlight conversion
  - automatic brace numbering
  - explicit brace numbering
  - native Anki Cloze syntax
  - fenced code exclusion
  - inline code exclusion
- The helper returns a `Set<number>`.
- The renderer will continue owning HTML conversion; the helper is for planning only.
- Shared regex/constants may be extracted if practical, but behavior lock through tests is the required compatibility guarantee.

## Rebuild detection rule

- Rebuild only when all of the following hold:
  - current card has a noteId
  - old state exists for that noteId
  - old and new runtime card types are both `cloze`
  - old mode is `sequential` or legacy-missing and treated as sequential
  - new mode is `all`
  - old final Cloze number set size is greater than new final Cloze number set size
- If sequential-to-all does not shrink the number set, keep the normal update path.
- all-to-sequential never rebuilds.
- Same-mode Cloze shrink is out of scope.

## Manual sync plan shape

- Extend `ManualSyncPlan` with `toRebuild: PlannedCard[]`.
- Rebuild cards are excluded from:
  - `toUpdate`
  - `toChangeDeck`
  - `toRewriteMarker`
- Rebuild cards may still appear in `toVerifyDeck` only if execution needs existing note summaries for missing-note fallback checks; otherwise they can be handled independently.

## Anki execution order

- Rebuild order is:
  1. render and validate fields
  2. ensure target deck
  3. upload media
  4. add the new note
  5. delete the old note
  6. record the new noteId in `resolvedNoteIds`
  7. emit marker write for the new noteId
- Add-first-then-delete is mandatory.

## Failure handling and rollback

- If add fails, stop immediately.
- Old note remains untouched.
- No marker write is emitted.
- No new resolved noteId is returned.
- If delete old note fails after add succeeded:
  - attempt best-effort `deleteNotes([newNoteId])`
  - throw the delete failure
  - do not emit success marker writes
  - do not return the new noteId as resolved
- Cleanup failure can only be best-effort in v1; the primary failure is still surfaced.

## Result counting decision

- Add `rebuilt` to executor and manual sync result types.
- Include `rebuilt` in sync notices because current result plumping is localized and low-cost.
- `rebuilt` remains a separate count rather than being merged into `updated`.

## Intentional deviation from the initial plan

- The initial plan allowed optional marker-text inference for legacy state. This implementation intentionally defaults legacy missing Cloze mode to sequential without raw-marker inference because the repository already stores runtime `cardType: "cloze"` only, and sequential default covers the required migration path without extra brittle parsing in state migration.
