# Card Answer Cutoff Decisions

Date: 2026-04-23

## Decision 1: Add a new explicit settings enum

- Add `cardAnswerCutoffMode` to `PluginSettings` as:
  - `heading-block`
  - `double-blank-lines`
- Default value is `heading-block`.
- Validation rejects anything else.

Reason:
- This matches the plan and keeps the new behavior fully explicit in persistence, tests, and fingerprint invalidation.

## Decision 2: Use one shared boundary helper for all three parsing routes

- Introduce a shared helper under manual-sync parsing services.
- The helper will accept:
  - source lines for the current region
  - absolute start line
  - fallback line for empty content
  - cutoff mode
  - marker matcher/parser callbacks
- The helper will return at least:
  - `contentLines`
  - `trailingLines`
  - `contentEndLine`
  - `markerLine`
  - `markerIndent`
  - marker parse result when valid
  - marker presence state

Reason:
- The actual repository currently duplicates this logic three times. Consolidation is the smallest change that enforces plan-wide consistency.

## Decision 3: Marker precedence scans the whole region, not only the last non-empty line

- The helper will search for the first valid marker candidate inside the region.
- A valid marker always wins over blank-line cutoff.
- Only valid markers lock the cutoff boundary.
- Invalid marker candidates do not lock the boundary.
- If no valid marker exists and mode is `double-blank-lines`, the first run of 2 or more consecutive blank lines ends the content.
- If neither applies, fallback remains the full heading block / child region / group block.

Reason:
- The plan requires old layout compatibility and new layout support where marker/GI is moved before remarks.

## Decision 4: Preserve current hashing semantics except for intentional cutoff changes

- Normal QA/Cloze `rawBlockText` stays `heading + trimmed content lines`.
- Semantic QA `rawBlockText` stays `semantic-qa child identity + parent display title + child label + bodyMarkdown`.
- QA Group `rawBlockText` stays based on stem, parsed items, and normalized body lines.
- The only intended hash shifts are those caused by the new cutoff rule excluding remarks/trailing content from the answer region.

Reason:
- This keeps state recovery behavior as stable as possible while still honoring the new contract.

## Decision 5: Normalize marker/GI writeback with a shared blank-tail routine

- Card and group marker services will share a common normalization helper.
- The writeback contract is:
  - trim blank lines immediately after the answer region
  - remove existing marker line when replacing
  - insert the new marker at `contentEndLine`
  - remove any blank lines between marker and trailing content
  - if trailing non-blank content exists, insert exactly two blank lines after the marker
  - preserve trailing non-blank content exactly as scanned
- QA Group writeback will continue to strip legacy inner ID markers.

Reason:
- The current services already do most of this. Sharing the normalization step reduces divergence and makes the plan’s rule explicit.

## Decision 6: Thread cutoff mode through indexing context only

- Add the setting to `CardIndexingContext`.
- `FileIndexerService` passes it into `CardIndexingService.index()` for both vault and single-file indexing.
- No rendering-layer contract changes are needed.

Reason:
- The feature affects indexing and writeback placement, not render output formatting.

## Decision 7: Put cutoff mode into the deck-rules fingerprint path

- Update `createDeckRulesFingerprint()` to include `cardAnswerCutoffMode`.
- Keep the existing fingerprint path rather than adding a parallel reindex fingerprint.

Reason:
- The repository already uses this fingerprint to force rereads on unchanged files. Reusing it is the smallest compatible integration.

## Decision 8: Keep the settings UI shape consistent with the repository

- Add one dropdown setting labeled with the two cutoff modes.
- Add concise zh/en descriptions that mirror the user-facing semantics from the plan.
- Cover both locales in existing settings tab tests.

Reason:
- The existing settings page relies on dropdown/toggle controls and is already tested that way.

## Decision 9: Test coverage will be expanded at the service level first

- Primary behavior tests go into:
  - `CardIndexingService.test.ts`
  - `SemanticQaListParser.test.ts`
  - `CardMarkerService.test.ts`
  - `GroupMarkerService.test.ts`
  - `FileIndexerService.test.ts`
  - `ManualSyncService.test.ts`
  - `PluginSettings.test.ts`
  - `PluginSettingTab.test.ts`
- Add QA Group parser/service tests only where the cutoff or writeback behavior actually changes.

Reason:
- These files already exercise the real runtime path and minimize new test scaffolding.

## Confirmed Non-Goals

- No expansion of QA Group answer modeling beyond the existing “first second-level item” contract.
- No new sync pipeline or new persistence store shape.
- No unrelated deck, render, or note-field-mapping refactor.