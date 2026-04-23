# Card Answer Cutoff Gap Report

Date: 2026-04-23

## Real Code Review Summary

- Settings currently live in `src/application/config/PluginSettings.ts` and are persisted by merge-with-defaults in `src/presentation/AnkiHeadingSyncPlugin.ts` via `DataJsonPluginConfigRepository`.
- The settings UI is rendered in `src/presentation/settings/PluginSettingTab.ts` and already has test coverage in `src/presentation/settings/PluginSettingTab.test.ts`.
- Normal QA/Cloze boundary parsing is inside `extractMarker()` in `src/domain/manual-sync/services/CardIndexingService.ts`.
- Semantic QA child-card boundary parsing is separate in `extractTrailingMarker()` in `src/domain/manual-sync/services/SemanticQaListParser.ts`.
- QA Group boundary parsing is separate again in `extractTrailingGroupMarker()` in `src/domain/manual-sync/services/QaGroupBlockParser.ts`.
- Card ID writeback is handled by `src/domain/manual-sync/services/CardMarkerService.ts`.
- QA Group GI writeback is handled by `src/domain/manual-sync/services/GroupMarkerService.ts`.
- Re-index invalidation is controlled by `createDeckRulesFingerprint()` in `src/application/services/FileIndexerService.ts` and respected by `FileIndexerService.indexVault()`.

## Current Behavior vs Plan

### 1. Settings and persistence

Current:
- No `cardAnswerCutoffMode` exists.
- Validation has no cutoff-mode enum guard.
- Settings UI has no control for answer cutoff behavior.
- Existing settings tests cover defaults and validation only.

Gap:
- Need new union setting, default, validation, i18n labels, UI control, and tests.

### 2. Normal QA/Cloze cutoff

Current:
- `CardIndexingService.extractMarker()` only checks the last non-empty line of the heading block.
- A valid trailing `<!--ID: ...-->` wins.
- If the last non-empty line is not an ID marker, the whole heading block remains body content.
- Invalid non-trailing marker text is treated as ordinary body text.

Gap:
- No configurable blank-line cutoff.
- No shared helper.
- Marker precedence is only implemented for a single trailing-line layout, not for a marker that appears before remarks.

### 3. Semantic QA cutoff

Current:
- `SemanticQaListParser.extractTrailingMarker()` repeats the same “last non-empty line only” rule for each child region.
- No blank-line cutoff.
- No trailing-content split is returned, so remarks after a marker cannot be modeled explicitly.

Gap:
- Must reuse shared cutoff logic and support marker-before-remarks + double-blank-lines semantics.

### 4. QA Group cutoff

Current:
- `QaGroupBlockParser.extractTrailingGroupMarker()` also only recognizes a GI marker on the last non-empty line of the group block.
- Legacy inner `<!--ID: ...-->` lines are stripped from `rawBlockText`, but not from boundary calculation.
- `contentEndLine` is currently the last non-empty line of the GI-stripped block.

Gap:
- Needs the same shared boundary logic, but with GI markers instead of ID markers.
- Must keep existing item-answer contract unchanged while changing only boundary semantics and GI placement normalization.

### 5. Marker/GI writeback normalization

Current:
- `CardMarkerService.applyWrite()` and `GroupMarkerService.applyWrite()` already insert the marker at `contentEndLine`, remove following blank lines, and then ensure two blank lines if trailing content exists.
- Both services preserve non-blank trailing content after the insertion point.
- Group writeback additionally removes legacy inner ID markers.

Gap:
- The normalization behavior is duplicated rather than shared.
- Current parsing never exposes “trailing after cutoff”, so writeback stability depends on line surgery alone.
- Need explicit normalization contract: trim answer tail blanks, write marker, keep exactly two blank lines, then append trailing content unchanged.

### 6. Fingerprint invalidation

Current:
- `createDeckRulesFingerprint()` hashes heading levels, QA Group marker, semantic marker, default deck, file deck toggles, file deck marker, and folder mode.
- Tests already prove fingerprint changes force re-read and deck migration checks on otherwise unchanged files.

Gap:
- New cutoff mode must participate in the same fingerprint so switching modes forces reread/reindex.

## Integration Points To Change

- `src/application/config/PluginSettings.ts`
- `src/application/config/PluginSettings.test.ts`
- `src/presentation/settings/PluginSettingTab.ts`
- `src/presentation/settings/PluginSettingTab.test.ts`
- `src/presentation/i18n/messages/zh.ts`
- `src/presentation/i18n/messages/en.ts`
- `src/application/services/FileIndexerService.ts`
- `src/application/services/FileIndexerService.test.ts`
- `src/domain/manual-sync/services/CardIndexingService.ts`
- `src/domain/manual-sync/services/SemanticQaListParser.ts`
- `src/domain/manual-sync/services/QaGroupBlockParser.ts`
- `src/domain/manual-sync/services/CardMarkerService.ts`
- `src/domain/manual-sync/services/GroupMarkerService.ts`
- Relevant tests for the above parsers and writeback services
- `src/application/services/ManualSyncService.test.ts` for unchanged-file reread behavior

## Shared Helper Candidates

The repository already has three near-duplicate local boundary functions:

- `extractMarker()` in `CardIndexingService.ts`
- `extractTrailingMarker()` in `SemanticQaListParser.ts`
- `extractTrailingGroupMarker()` in `QaGroupBlockParser.ts`

These are the correct consolidation targets. A shared helper should become the single owner of:

- valid-marker precedence
- invalid-marker behavior
- blank-line cutoff behavior
- trailing-content capture
- `contentEndLine`
- marker line / indent metadata

## Scope Drift Risks

- QA Group parsing currently uses the entire body block for `rawBlockText`; changing item extraction or answer selection would exceed scope.
- Semantic QA raw hash semantics must remain stable except where the cutoff contract intentionally excludes trailing remarks.
- Existing invalid-marker compatibility must remain: invalid markers do not lock identity and do not gain precedence.
- Writeback must stay bottom-up and source-content-based through `MarkdownWriteBackService`; no parallel write pipeline should be introduced.

## Required Deviation From The Plan

- The plan asks for a shared helper returning marker info and trailing content. In this codebase, the helper must be parameterized by marker service type because ID and GI markers use different parse/create payloads.
- The settings UI is currently organized as a single settings page with dropdowns/toggles, not a separate radio-group abstraction. The new mode should therefore be added as a dropdown in the existing page structure to stay consistent with the repository.