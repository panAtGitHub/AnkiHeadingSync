# Clear Current File Full-Coverage Decisions

## Command semantic

- Keep the command semantic fixed as: clear all synced entries in the current file.
- Covered routes:
  - normal QA / cloze cards
  - semantic QA child cards written with `<!--ID: ...-->`
  - QA Group blocks written with `<!--GI: ...-->`

## Collection strategy

- `ClearCurrentFileSyncedCardsUseCase` will collect two separate tracked sets:
  - `trackedCards: CardState[]`
  - `trackedGroupBlocks: GroupBlockState[]`
- Collection sources:
  - cards from `files[filePath].noteIds` plus `state.cards` fallback by `filePath`
  - groups from `files[filePath].groupIds` plus `state.groupBlocks` fallback by `filePath`
- `hasTrackedCards(filePath)` will mean any tracked card or tracked group exists for the file.
- Anki note deletion will use one deduplicated `noteIds` array across both sets.

## Marker removal strategy

- Add a new application-layer service named `MarkdownSyncedMarkerRemovalService`.
- The service will:
  - read the Markdown file once
  - remove matching `ID` markers by `noteId`
  - remove matching `GI` markers by `noteId`
  - call `replaceMarkdownFile(...)` at most once per file
- It will reuse `CardMarkerRemovalService` and `GroupMarkerService` for marker recognition and low-level line operations instead of replacing their existing responsibilities.
- Removal will match by `noteId`; `groupId` and `blockStartLine` stay in the input/result surface for traceability but not as the primary deletion key.

## Local state cleanup strategy

- The clear path will remove from local state:
  - tracked card entries in `state.cards`
  - tracked group entries in `state.groupBlocks`
  - `state.files[filePath]`
  - all `pendingWriteBack` entries where `pending.filePath === filePath`
- Pending cleanup is file-scoped by design and will not rely on `targetNoteId` matching.

## Result and notice shape

- Extend `ClearCurrentFileSyncedCardsResult` with split stats for cards, groups, ID markers, GI markers, and local-record deletions.
- `NoticeService.showClearCurrentFileSummary(...)` will render total counts plus group/card breakdown instead of collapsing everything into `trackedCards`.

## Testing scope

- Keep existing normal-card clear behavior passing.
- Add coverage for:
  - semantic QA clear
  - QA Group clear
  - mixed-file clear with deduplicated note deletion
  - GI-marker conflict handling
  - file-scoped pending cleanup for both `card-id` and `group-gi`
- No changes will be made to normal sync, rebuild, `QaGroupSyncService`, or semantic/group routing beyond what is needed to support clear-current-file.