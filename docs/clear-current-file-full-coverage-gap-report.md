# Clear Current File Full-Coverage Gap Report

## Scope reviewed

- `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.ts`
- `src/application/services/MarkdownMarkerRemovalService.ts`
- `src/domain/manual-sync/services/CardMarkerRemovalService.ts`
- `src/domain/manual-sync/services/GroupMarkerService.ts`
- `src/domain/manual-sync/entities/PluginState.ts`
- `src/application/use-cases/cleanupResetTypes.ts`
- `src/presentation/notices/NoticeService.ts`
- `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.test.ts`
- related write-back/state flow in `MarkdownWriteBackService` and `QaGroupSyncService`

## Confirmed current behavior

### 1. Current clear command only tracks normal cards

- `ClearCurrentFileSyncedCardsUseCase` only calls `collectTrackedCards(state, filePath)`.
- `collectTrackedCards(...)` only reads `state.files[filePath]?.noteIds` and `state.cards` fallback.
- `state.files[filePath]?.groupIds` and `state.groupBlocks` are ignored entirely.

### 2. Current marker removal is ID-only

- `MarkdownMarkerRemovalService` delegates only to `CardMarkerRemovalService`.
- `CardMarkerRemovalService` only removes `<!--ID: ...-->` markers by `noteId`.
- There is no application-layer remover that also consumes `GroupMarkerService` and strips `<!--GI: ...-->`.

### 3. Current local cleanup only clears card records

- `buildNextState(...)` deletes matching `state.cards` entries and the file entry in `state.files`.
- It does not delete `state.groupBlocks` for the same file.
- `pendingWriteBack` cleanup currently filters by both `pending.filePath !== filePath` and tracked note keys, which is narrower than the required file-scoped clear semantics.
- Because `group-gi` pending entries are file-scoped and may not map cleanly through the tracked-note filter, current cleanup is incomplete for group writes.

### 4. Current result type and notice summary assume only normal cards

- `ClearCurrentFileSyncedCardsResult` only exposes `trackedCards`, `deletedNotes`, `removedMarkers`, `deletedLocalRecords`, `conflictFiles`, and `failureFiles`.
- `NoticeService.showClearCurrentFileSummary(...)` renders only one tracked-card count and one removed-marker total.
- A file containing only QA Group state would currently produce misleading summary output.

### 5. State model already supports the missing routes

- `PluginState` already contains `groupBlocks` and `FileState.groupIds`.
- `PendingWriteBackState` already has `markerKind?: "card-id" | "group-gi"` and `targetGroupId`.
- `MarkdownWriteBackService` already persists `group-gi` pending entries and `QaGroupSyncService` already writes GI markers.
- This confirms the bug is in the clear-current-file command path, not in the underlying state model.

### 6. Current tests only cover normal cards

- `ClearCurrentFileSyncedCardsUseCase.test.ts` covers:
  - normal-card clear success
  - empty-file result
  - ID-marker conflict handling
- It does not cover:
  - semantic QA child cards
  - QA Group GI markers
  - mixed files
  - group conflict behavior
  - `group-gi` pending cleanup

## Gap versus required behavior

- Missing tracked group collection from `groupIds` and `groupBlocks` fallback.
- Missing unified marker removal for both `ID` and `GI` markers.
- Missing group-block deletion from local state.
- Missing file-scoped pending cleanup for all entries in the cleared file.
- Missing result fields for group-specific stats.
- Missing notice summary split for card markers vs group markers.
- Missing regression coverage for semantic QA, QA Group, mixed files, group conflicts, and pending cleanup.