# Pre-release Cleanup Gap Report

## Scope

This report is based on a real repository inspection on 2026-04-27. It records the currently active runtime path and the exact cleanup points needed for the pre-release stability plan.

## Confirmed active sync path

- Runtime entry is `main.ts` -> `src/presentation/AnkiHeadingSyncPlugin.ts`.
- `AnkiHeadingSyncPlugin.onload()` creates:
  - `DataJsonPluginConfigRepository`
  - `DataJsonPluginStateRepository`
  - `ObsidianVaultGateway`
  - `AnkiConnectGateway`
  - `ManualSyncCurrentFileUseCase`
  - `ManualSyncVaultUseCase`
  - `RebuildCardIndexUseCase`
  - `ClearCurrentFileSyncedCardsUseCase`
  - `CleanupEmptyDecksUseCase`
- Registered active commands are currently only:
  - sync current file
  - sync vault
  - clear current file synced cards
  - cleanup empty decks
- Sync execution path is:
  - plugin command callback
  - `ManualSyncCurrentFileUseCase` / `ManualSyncVaultUseCase`
  - `ManualSyncService`
  - `FileIndexerService`
  - `CardIndexingService`
  - `DiffPlannerService`
  - `AnkiBatchExecutor`
  - `QaGroupSyncService`
  - `MarkdownWriteBackService`
  - persisted plugin state

## Confirmed Semantic QA references

### Active

- `src/application/config/PluginSettings.ts`
  - `CARD_TYPE_CONFIG_IDS` still includes `semantic-qa`.
  - `PluginSettings` still contains `semanticQaMarker` and `semanticQaNoteType`.
  - defaults, merge logic, validation, and legacy field derivation still include Semantic QA.
- `src/application/config/NoteModelFieldMapping.ts`
  - basic-like mapping still includes `semantic-qa`.
- `src/application/services/NoteFieldMappingService.ts`
  - missing/incomplete/title-body validation still includes Semantic QA branches.
- `src/application/services/RenderConfigService.ts`
  - runtime note-model resolution still has a `semantic-qa` branch.
- `src/domain/card/entities/RenderedFields.ts`
  - `CardType` still includes `semantic-qa`.
- `src/domain/manual-sync/services/CardIndexingService.ts`
  - match order still includes `semantic-qa`.
  - parser injection and runtime indexing branch are active.
- `src/domain/manual-sync/services/SemanticQaListParser.ts`
  - real active parser used by `CardIndexingService`.
- `src/presentation/i18n/messages/en.ts` and `src/presentation/i18n/messages/zh.ts`
  - settings labels, validation errors, note-field-mapping errors, and row labels still include Semantic QA.

### UI-visible but intentionally hidden in one place only

- `src/presentation/settings/PluginSettingTab.ts`
  - visible card blocks are limited to basic, qa-group, cloze.
  - however helper methods and labels still retain `semantic-qa` support branches.

### Tests tied to Semantic QA

- `src/domain/manual-sync/services/SemanticQaListParser.test.ts`
- `src/domain/manual-sync/services/CardIndexingService.test.ts`
- `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.test.ts`
- `src/infrastructure/persistence/DataJsonPluginConfigRepository.test.ts`
- `src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts`
- `src/application/config/PluginSettings.test.ts`
- `src/presentation/settings/PluginSettingTab.test.ts`

## Confirmed rebuild-index references

### Active runtime wiring

- `src/presentation/AnkiHeadingSyncPlugin.ts`
  - imports and constructs `RebuildCardIndexUseCase`.
  - exposes `runRebuildCardIndex()`.
- `src/application/use-cases/RebuildCardIndexUseCase.ts`
  - thin wrapper over `ManualSyncService.rebuildIndex()`.
- `src/application/services/ManualSyncService.ts`
  - still implements `rebuildIndex()`.
- `src/presentation/notices/NoticeService.ts`
  - still implements `showRebuildSummary()`.
- `src/presentation/i18n/messages/en.ts` and `src/presentation/i18n/messages/zh.ts`
  - still include rebuild labels, failure text, and rebuild summary copy.

### Not user-exposed as a registered command

- `src/presentation/commands/registerCommands.ts`
  - rebuild is not registered.
- `src/presentation/settings/PluginSettingTab.test.ts`
  - already asserts the command guide does not show rebuild.

### Tests tied to rebuild path

- `src/application/services/ManualSyncService.test.ts`
- `src/presentation/notices/NoticeService.test.ts`
- `src/presentation/commands/registerCommands.test.ts`

## Current empty-include behavior

- Default settings are still:
  - `scopeMode: "include"`
  - `includeFolders: []`
- `ScanScopeService.isPathInScope()` returns `false` for include mode when the normalized include list is empty.
- `ManualSyncService.syncFile()` uses `isPathInScope()` and throws `CurrentFileOutOfScopeError`.
- `ManualSyncService.syncVault()` has no dedicated empty-include guard.
- `FileIndexerService.indexVault()` therefore receives an empty ref list and returns:
  - `scannedFiles: 0`
  - empty cards/group blocks
- Current behavior gap:
  - current-file sync reports a generic out-of-scope message
  - vault sync can silently scan zero files and produce a normal-looking success summary
  - settings page currently shows no explicit warning for include mode with zero selected folders

## Current Markdown writeback implementation

- `src/infrastructure/obsidian/ObsidianVaultGateway.ts :: replaceMarkdownFile()` currently does:
  - `getAbstractFileByPath`
  - `vault.cachedRead(file)`
  - compares against `expectedContent`
  - `vault.modify(file, nextContent)`
- Conflict detection exists, but it happens outside an atomic `vault.process(file, fn)` callback.
- Existing writeback semantics depend on this gateway for:
  - ID marker writes/removals
  - GI marker writes/removals
  - deck template insertion

## Current debounce-save behavior

- `src/presentation/settings/PluginSettingTab.ts`
  - text inputs use `scheduleDebouncedTextSave()` with a 500ms timeout.
  - `hide()` currently calls `clearDebouncedTextSaves()`.
- Current behavior gap:
  - hide tears down pending timers
  - hide does not flush pending draft values
  - closing the settings tab within the debounce window can drop the last edit

## Release metadata and packaging gaps

- Root `README.md` is missing.
- Root `LICENSE` is missing.
- `manifest.json` still has author metadata set to GitHub Copilot / GitHub Copilot URL.
- `package.json` still pins `devDependencies.obsidian` to `latest` instead of `1.12.3`.
- build output is correct for release safety:
  - esbuild writes `dist/plugin/main.js` and copies it to root `main.js`
  - staging copies `manifest.json`, `versions.json`, and optional `styles.css` into `dist/plugin`
  - sync script copies only `main.js`, `manifest.json`, and `styles.css` to the Obsidian plugin directory
  - sync script does not overwrite `data.json`

## Risky deletion points

- `PluginSettings.ts`
  - removing Semantic QA touches defaults, type unions, validation, merge logic, legacy derivation, and hydration.
- `CardIndexingService.ts`
  - Semantic QA is in the active card-type resolution order, so deletion must not disturb basic/cloze/qa-group matching.
- `RenderedFields.ts`, `NoteModelFieldMapping.ts`, `NoteFieldMappingService.ts`, `RenderConfigService.ts`
  - all currently assume Semantic QA is a valid runtime card type.
- `ManualSyncService.ts`
  - rebuild removal must not break current-file or vault sync orchestration.
- `NoticeService.ts` and i18n files
  - rebuild and Semantic QA copy is spread through multiple translation branches.
- `PluginSettingTab.ts`
  - debounced text saves are centralized but currently not flushable; hide behavior must be changed carefully to avoid double saves.
