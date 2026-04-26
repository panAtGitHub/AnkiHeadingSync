# Plugin Improvement Audit Architecture Map

## Scope

This map is based on the current production runtime path in the repository as inspected on 2026-04-26. It focuses on active code, active wiring, and code paths that materially affect user-visible sync behavior.

## 1. Active Entry Points

### Runtime entry

- `main.ts`
  - Exports `src/presentation/AnkiHeadingSyncPlugin.ts` as the plugin entry.

### Plugin composition root

- `src/presentation/AnkiHeadingSyncPlugin.ts :: onload()`
  - Creates persistence adapters:
    - `src/infrastructure/obsidian/ObsidianPluginDataStore.ts`
    - `src/infrastructure/persistence/DataJsonPluginConfigRepository.ts`
    - `src/infrastructure/persistence/DataJsonPluginStateRepository.ts`
  - Creates external gateways:
    - `src/infrastructure/anki/AnkiConnectGateway.ts`
    - `src/infrastructure/obsidian/ObsidianVaultGateway.ts`
  - Creates main use cases:
    - `ManualSyncCurrentFileUseCase`
    - `ManualSyncVaultUseCase`
    - `RebuildCardIndexUseCase`
    - `ClearCurrentFileSyncedCardsUseCase`
    - `CleanupEmptyDecksUseCase`
  - Registers commands through `src/presentation/commands/registerCommands.ts`
  - Registers the settings UI through `src/presentation/settings/PluginSettingTab.ts`

### User-visible command surface

- `src/presentation/commands/registerCommands.ts`
  - Registers 4 commands:
    - sync current file
    - sync vault
    - clear current file synced cards
    - cleanup empty decks

### User-visible settings surface

- `src/presentation/settings/PluginSettingTab.ts`
  - Active cards:
    - card types
    - sync content
    - deck
    - scope
    - commands

## 2. Active Runtime Layers

### Presentation

- `src/presentation/AnkiHeadingSyncPlugin.ts`
  - Plugin lifecycle, command callbacks, notices, settings update entry.
- `src/presentation/settings/PluginSettingTab.ts`
  - Settings rendering, note-type cache loading, field-mapping editing, folder-scope editing, deck template insertion button.
- `src/presentation/notices/NoticeService.ts`
  - User-facing success/error summaries.
- `src/presentation/modals/EmptyDeckSelectionModal.ts`
  - Deck cleanup modal.
- `src/presentation/i18n/*`
  - Locale detection and message lookup.

### Application

- `src/application/use-cases/*`
  - Thin user-action entry points over services.
- `src/application/services/ManualSyncService.ts`
  - Main orchestration service for file sync, vault sync, and rebuild index.
- `src/application/services/FileIndexerService.ts`
  - Scope filtering, incremental scan decisions, state-assisted restore of unchanged cards.
- `src/application/services/AnkiBatchExecutor.ts`
  - Batched Anki note create/update/model-migrate/tag-sync/deck-change/media-upload.
- `src/application/services/QaGroupSyncService.ts`
  - QA Group note sync, slot preservation, model mismatch handling, GI marker generation.
- `src/application/services/MarkdownWriteBackService.ts`
  - File-grouped marker writes, conflict capture, pending write-back generation.
- `src/application/services/RenderConfigService.ts`
  - Deck resolution, note-model selection, render-config hashing.
- `src/application/services/NoteFieldMappingService.ts`
  - Saved mapping validation and rendered-field projection.
- `src/application/services/QaGroupFieldMappingService.ts`
  - QA Group slot derivation and validation.

### Domain

- `src/domain/manual-sync/services/CardIndexingService.ts`
  - Heading scanning, card-type detection, ID/GI marker recovery, QA Group and semantic QA parsing.
- `src/domain/manual-sync/services/DiffPlannerService.ts`
  - Create/update/change-deck/rewrite-marker/orphan planning.
- `src/domain/manual-sync/services/CardMarkerService.ts`
  - Card ID marker parse/create/validate/apply.
- `src/domain/manual-sync/services/GroupMarkerService.ts`
  - GI marker parse/create/validate/apply.
- `src/domain/manual-sync/services/DeckExtractionService.ts`
  - YAML/body deck declaration parsing.
- `src/domain/manual-sync/services/DeckResolutionService.ts`
  - Folder/file/default deck resolution and warning generation.
- `src/domain/manual-sync/services/QaGroupBlockParser.ts`
  - QA Group block parsing.
- `src/domain/manual-sync/services/SemanticQaListParser.ts`
  - Semantic QA list parsing.

### Infrastructure

- `src/infrastructure/anki/AnkiConnectGateway.ts`
  - AnkiConnect HTTP adapter and `multi` request batching.
- `src/infrastructure/obsidian/ObsidianVaultGateway.ts`
  - Vault reads, compare-and-swap writes, folder tree, backlinks, media resolution.
- `src/infrastructure/persistence/DataJsonPluginConfigRepository.ts`
  - Settings load/save normalization and validation.
- `src/infrastructure/persistence/DataJsonPluginStateRepository.ts`
  - Plugin state load/save and migration.

## 3. Main Data Flow

### Manual sync: current file

1. Command callback in `registerCommands()` calls `AnkiHeadingSyncPlugin.runSyncCurrentFile()`.
2. `ManualSyncCurrentFileUseCase.execute()` forwards to `ManualSyncService.syncFile()`.
3. `ManualSyncService.syncFile()` validates settings and scope, then loads plugin state.
4. `FileIndexerService.indexFile()` reads the target Markdown file and delegates parsing to `CardIndexingService.index()`.
5. `DiffPlannerService.plan()` compares indexed cards with persisted state.
6. `AnkiBatchExecutor.execute()` syncs ordinary/basic/cloze/semantic cards.
7. `QaGroupSyncService.sync()` syncs QA Group blocks separately.
8. `MarkdownWriteBackService.write()` writes card ID markers and GI markers back into Markdown.
9. `ManualSyncService.buildNextState()` saves files/cards/groupBlocks/pending write-back into plugin state.
10. `NoticeService.showSyncSummary()` renders a localized summary.

### Manual sync: vault

1. `ManualSyncVaultUseCase.execute()` forwards to `ManualSyncService.syncVault()`.
2. `FileIndexerService.indexVault()` uses `ScanScopeService` plus `ObsidianVaultGateway.listMarkdownFileRefs()` to enumerate in-scope files.
3. Incremental decisions are made per file using file stamp, deck-rule fingerprint, missing known cards, and pending write-back state.
4. Remaining flow matches current-file sync.

### Rebuild index

1. `RebuildCardIndexUseCase.execute()` forwards to `ManualSyncService.rebuildIndex()`.
2. Vault is reindexed with `forceReadAll = true`.
3. No Anki note create/update occurs.
4. Existing markers can still be rewritten if enough identity exists.
5. Persisted state is rebuilt from indexed files plus recovered QA Group state.

### Clear current file synced cards

1. `ClearCurrentFileSyncedCardsUseCase.hasTrackedCards()` checks local state for current file.
2. `execute()` loads note IDs/group IDs from local state.
3. Anki notes are deleted through `AnkiGateway.deleteNotes()`.
4. Markdown markers are removed through `MarkdownSyncedMarkerRemovalService`.
5. Local state is rewritten without that file’s cards/groups.

## 4. Critical State Objects

### Settings

- `src/application/config/PluginSettings.ts :: PluginSettings`
  - Controls note-type selection, field mapping caches, deck logic, scope logic, backlink behavior, tag sync, and AnkiConnect URL.
  - Contains both current `cardTypeConfigs` and legacy mirrored note-type fields.

### Persisted plugin state

- `src/domain/manual-sync/entities/PluginState.ts :: PluginState`
  - `files`
    - Per-file index metadata: `fileHash`, `fileStamp`, `deckRulesFingerprint`, `noteIds`, `groupIds`.
  - `cards`
    - Per-note synced card snapshot keyed by note ID.
  - `groupBlocks`
    - Per-QA-group synced snapshot keyed by group ID.
  - `pendingWriteBack`
    - Deferred marker writes intended for conflict recovery.

### Scan-time objects

- `IndexedCard`
- `IndexedGroupCardBlock`
- `IndexedFile`

### Plan-time objects

- `src/domain/manual-sync/value-objects/ManualSyncPlan.ts :: ManualSyncPlan`
  - `toCreate`
  - `toUpdate`
  - `toVerifyDeck`
  - `toChangeDeck`
  - `toRewriteMarker`
  - `toOrphan`

## 5. Main External API Boundaries

### Obsidian APIs

- `Plugin.loadData()` / `Plugin.saveData()` through `ObsidianPluginDataStore`
- Vault file enumeration through `ObsidianVaultGateway.listMarkdownFileRefs()`
- Compare-and-swap write boundary through `ObsidianVaultGateway.replaceMarkdownFile()`
- Metadata and tag extraction through `getAllTags()` and cached metadata
- Obsidian notices and settings controls in presentation layer

### AnkiConnect

- All network calls are centralized in `AnkiConnectGateway.invoke()` / `invokeMulti()`.
- The adapter uses AnkiConnect action names directly (`modelNames`, `deckNamesAndIds`, `getDeckStats`, `addNote`, `updateNoteFields`, `changeDeck`, `deleteDecks`, `storeMediaFile`, `multi`, etc.).

## 6. Active Code vs Likely Legacy / Dormant Remnants

### Clearly active

- `main.ts`
- `src/presentation/AnkiHeadingSyncPlugin.ts`
- `src/presentation/settings/PluginSettingTab.ts`
- `src/application/services/ManualSyncService.ts`
- `src/application/services/FileIndexerService.ts`
- `src/application/services/AnkiBatchExecutor.ts`
- `src/application/services/QaGroupSyncService.ts`
- `src/infrastructure/anki/AnkiConnectGateway.ts`
- `src/infrastructure/obsidian/ObsidianVaultGateway.ts`

### Generated or packaging artifacts

- `main.js`
  - Root-level generated bundle copy written by `esbuild.config.mjs`.
- `dist/plugin/*`
  - Staged package output used for release/manual sync.

### Debug / manual inspection scripts

- `query_note.js`
- `query_notes.js`
  - Direct HTTP scripts with hard-coded note IDs and no repository call sites.

### Likely dormant or legacy architectural branches

- `src/application/services/QaGroupModelService.ts`
- `src/application/services/QaGroupModelDefinition.ts`
- `src/application/config/ManagedNoteModels.ts`
  - These define and test a managed `ObsiAnki QA Group 12` model, but no production runtime call site invokes `QaGroupModelService.ensureModel()`.
  - The active runtime QA Group path instead uses user-selected note types plus `QaGroupFieldMappingService`.

- `src/presentation/AnkiHeadingSyncPlugin.ts :: runRebuildCardIndex()`
  - Wired in plugin initialization, but not surfaced by `registerCommands()` and not listed in the settings command card.

- Legacy mirrored settings fields in `PluginSettings`
  - `qaHeadingLevel`, `clozeHeadingLevel`, `qaGroupMarker`, `qaNoteType`, `clozeNoteType`, `semanticQaMarker`, `semanticQaNoteType`
  - Still exist and are derived from `cardTypeConfigs`, which indicates an unfinished migration rather than a clean single source of truth.

## 7. Audit Notes

- The active sync engine is stateful and layered.
- The highest-value audit attention should stay on:
  - pending write-back persistence
  - QA Group authority split
  - semantic QA runtime/UI parity
  - AnkiConnect failure handling
  - hidden rebuild/recovery surface