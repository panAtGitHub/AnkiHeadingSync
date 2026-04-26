# Plugin Improvement Audit Report

## 1. Executive summary

This plugin is in a solid middle stage: the core sync engine is better structured than many Obsidian plugins, but product surface and failure recovery are still uneven.

- Overall maturity
  - Medium to high for core sync architecture.
  - Medium for user-facing completeness.
  - Medium-low for failure recovery resilience across restarts and AnkiConnect outages.

- Strongest parts
  - Layered runtime composition.
  - State-aware incremental indexing.
  - Explicit marker conflict detection instead of blind overwrite.
  - Rich parser and sync-path test coverage for core card types.

- Highest-risk parts
  - Pending write-back recovery is discarded on load.
  - Destructive reset paths and batch sync are not transaction-safe.
  - Runtime feature surface and settings surface are not aligned.
  - QA Group note-model strategy is split between active user-model sync and dormant managed-model code.

- Next 3 most valuable improvements
  1. Persist `pendingWriteBack` correctly across plugin reloads and add restart-recovery tests.
  2. Add explicit AnkiConnect timeout/health-check handling and friendlier offline UX.
  3. Unify runtime product authority: semantic QA visibility, QA Group model strategy, and note-type source of truth.

- Validation baseline observed during this audit run
  - `git status --short`: clean.
  - `npm run lint`: passed.
  - `npm test`: failing in current baseline; failures cluster in `FileIndexerService`, `ManualSyncService`, and `ClearCurrentFileSyncedCardsUseCase` tests.

## 2. Architecture map

See [plugin-improvement-audit-architecture-map.md](plugin-improvement-audit-architecture-map.md).

In short, the active runtime path is:

`main.ts` -> `AnkiHeadingSyncPlugin.onload()` -> use cases -> `ManualSyncService` / cleanup use cases -> domain services + infrastructure gateways -> persisted plugin state + markdown write-back.

## 3. Confirmed strengths

### 3.1 Clear runtime composition and layer boundaries

- Evidence
  - `src/presentation/AnkiHeadingSyncPlugin.ts :: onload()` wires repositories, gateways, use cases, and the setting tab in one place.
  - Domain parsing and marker logic live outside presentation code.
  - AnkiConnect calls are centralized in `src/infrastructure/anki/AnkiConnectGateway.ts`.
- Why this is strong
  - It keeps plugin lifecycle, orchestration, parsing, and I/O mostly separated.
  - It makes future refactors possible without rewriting the whole plugin.

### 3.2 Incremental indexing is state-aware, not brute-force only

- Evidence
  - `src/application/services/FileIndexerService.ts :: indexRefs()` skips rereads when `fileStamp`, `deckRulesFingerprint`, and known-card presence still match.
  - The same path restores cards and group blocks from persisted state for unchanged files.
- Why this is strong
  - Large-vault behavior is already being treated as an engineering problem.
  - Re-indexing work is avoided when nothing relevant changed.

### 3.3 Marker write-back uses optimistic concurrency instead of blind overwrite

- Evidence
  - `src/infrastructure/obsidian/ObsidianVaultGateway.ts :: replaceMarkdownFile()` reads current content and throws `MarkdownWriteConflictError` if it no longer matches the scanned content.
  - `src/application/services/MarkdownWriteBackService.ts :: write()` collects `conflictFiles` and `pendingEntries` instead of silently overwriting.
- Why this is strong
  - This prevents silent file corruption when a note changes after scan but before marker write-back.

### 3.4 Card and QA Group identity recovery paths are explicit

- Evidence
  - `src/domain/manual-sync/services/CardIndexingService.ts :: resolveIdentity()` recovers by marker, by state, and by pending write-back.
  - `src/domain/manual-sync/services/CardIndexingService.ts :: resolveGroupIdentity()` recovers QA Group notes by GI marker, by `src`, or by block hash.
- Why this is strong
  - Sync identity is not tied to a single fragile marker path.
  - The design anticipates marker deletion and partial state recovery.

### 3.5 Saved field mappings are validated against live model fields

- Evidence
  - `src/application/services/NoteFieldMappingService.ts :: validateMapping()` rejects missing or stale fields.
  - `src/application/services/QaGroupFieldMappingService.ts :: validateMapping()` rejects missing QA Group fields, duplicate usage, and stale slot references.
- Why this is strong
  - The plugin does not blindly trust stale settings.
  - Model drift is surfaced as a user-facing problem instead of silently writing wrong fields.

### 3.6 User-facing error and i18n plumbing is centralized

- Evidence
  - `src/application/errors/PluginUserError.ts` separates internal errors from localized user messages.
  - `src/presentation/notices/NoticeService.ts` consolidates summary rendering.
  - `src/presentation/i18n/index.ts` and `src/presentation/i18n/messages/*` provide a real translation dictionary instead of ad hoc strings.
- Why this is strong
  - Error surfaces are at least architecturally prepared for consistent UX.

### 3.7 Core sync modules have non-trivial targeted tests

- Evidence
  - `src/application/services/ManualSyncService.test.ts`
  - `src/application/services/QaGroupSyncService.test.ts`
  - `src/infrastructure/anki/AnkiConnectGateway.test.ts`
  - `src/presentation/settings/PluginSettingTab.test.ts`
- Why this is strong
  - The repository is not relying only on smoke tests or manual validation.

## 4. Confirmed problems

### 4.1 Pending write-back recovery is discarded on every load

- Severity: high
- Area: sync correctness
- Evidence from real code
  - `src/application/services/MarkdownWriteBackService.ts :: write()` creates `pendingEntries` when marker write-back conflicts or fails.
  - `src/application/services/FileIndexerService.ts :: indexRefs()` explicitly consumes `state.pendingWriteBack` to force reread/recovery.
  - `src/infrastructure/persistence/DataJsonPluginStateRepository.ts :: migratePluginState()` always returns `pendingWriteBack: []`, even when loading an existing `PluginState`.
  - `src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts` currently asserts this behavior by expecting `loaded.pendingWriteBack` to equal `[]`.
- Why it matters
  - The codebase already models deferred marker recovery, but restart/load drops that state.
  - A user who hits a write conflict, closes Obsidian, then retries loses the recovery queue.
- Recommended fix
  - Preserve modern `pendingWriteBack` entries on load.
  - Keep legacy migration handling separate from modern-state passthrough.
  - Add explicit schema-versioned migration logic if needed.
- Estimated implementation size: M
- Risk level: medium
- Suggested test coverage
  - Persist and reload modern `pendingWriteBack` entries unchanged.
  - Restart after write conflict should still re-attempt marker repair.

### 4.2 Semantic QA is active in runtime but hidden in settings

- Severity: high
- Area: UX
- Evidence from real code
  - `src/application/config/PluginSettings.ts` includes `semantic-qa` in `CARD_TYPE_CONFIG_IDS` and requires `semanticQaNoteType`.
  - `src/domain/manual-sync/services/CardIndexingService.ts` actively parses semantic QA blocks.
  - `src/application/services/RenderConfigService.ts :: resolve()` actively selects a semantic QA note type.
  - `src/presentation/settings/PluginSettingTab.ts` hardcodes `VISIBLE_CARD_TYPE_CONFIG_IDS = ["basic", "qa-group", "cloze"]`.
  - `src/presentation/settings/PluginSettingTab.test.ts` explicitly expects semantic QA controls not to exist.
- Why it matters
  - Users can hit runtime semantic QA behavior without being able to fully configure, disable, or map it from the settings page.
  - This is a product-surface mismatch, not just a code-style issue.
- Recommended fix
  - Either surface semantic QA as a first-class configurable card type, or remove/disable the parser until a proper UI exists.
- Estimated implementation size: M
- Risk level: medium
- Suggested test coverage
  - Settings UI coverage for semantic QA controls.
  - End-to-end semantic QA sync with explicit note-type and field-mapping selection.

### 4.3 Rebuild index exists but is not exposed to users

- Severity: medium
- Area: UX
- Evidence from real code
  - `src/presentation/AnkiHeadingSyncPlugin.ts :: onload()` instantiates `RebuildCardIndexUseCase`.
  - `src/presentation/AnkiHeadingSyncPlugin.ts :: runRebuildCardIndex()` implements user-facing handling and notices.
  - `src/presentation/commands/registerCommands.ts` registers only 4 commands and does not register rebuild.
  - `src/presentation/settings/PluginSettingTab.ts :: renderCommandsCard()` lists only the 4 registered commands.
- Why it matters
  - A recovery-oriented feature exists in code but is unavailable in normal user flows.
  - That increases support burden and leaves state-recovery capability effectively dormant.
- Recommended fix
  - Add a command and a clearly labeled UI entry for rebuild index.
  - Document what rebuild does and does not do.
- Estimated implementation size: S
- Risk level: low
- Suggested test coverage
  - Command registration test.
  - Settings/UI test for rebuild trigger visibility.

### 4.4 QA Group model authority is split between active user-model sync and dormant managed-model code

- Severity: medium
- Area: architecture
- Evidence from real code
  - Active runtime QA Group sync uses `src/application/services/QaGroupSyncService.ts` plus `settings.cardTypeConfigs["qa-group"].noteType` and `QaGroupFieldMappingService`.
  - `src/application/services/QaGroupModelService.ts`, `src/application/services/QaGroupModelDefinition.ts`, and `src/application/config/ManagedNoteModels.ts` implement managed model creation for `ObsiAnki QA Group 12`.
  - Repository-wide search shows `QaGroupModelService` is only referenced by its own tests, not by production runtime.
  - `src/presentation/i18n/messages/en.ts` and `zh.ts` still describe QA Group as syncing into `ObsiAnki QA Group 12`.
- Why it matters
  - The repository currently carries two different product stories for QA Group.
  - That makes maintenance, documentation, and future migration decisions harder than necessary.
- Recommended fix
  - Decide one authority model:
    - fully user-selected QA Group models, or
    - plugin-managed QA Group model.
  - Remove or archive the losing branch.
  - Update settings copy accordingly.
- Estimated implementation size: M
- Risk level: medium
- Suggested test coverage
  - Remove dead branch tests or convert them into migration tests.
  - One integration path from settings to sync for the chosen authority model.

### 4.5 Settings UI is carrying too much stateful business logic in one file

- Severity: medium
- Area: architecture
- Evidence from real code
  - `src/presentation/settings/PluginSettingTab.ts` is roughly 1900 lines and owns:
    - note type cache loading
    - field cache hydration
    - QA Group derivation logic
    - debounced persistence
    - folder tree load/cache/expansion
    - card rendering and rerendering
  - The same class directly calls `plugin.updateSettings()` from many render-time control handlers.
- Why it matters
  - The file is already large enough that small changes can easily affect unrelated behavior.
  - UI, cache, mapping, and persistence concerns are mixed.
- Recommended fix
  - Split the setting tab into smaller card-focused modules and move mapping/cache orchestration into dedicated presenter/service helpers.
- Estimated implementation size: L
- Risk level: medium
- Suggested test coverage
  - Preserve existing UI tests while splitting into smaller component-level tests.
  - Add a render-count or localized-rerender test for card-scoped updates.

### 4.6 Legacy mirrored note-type fields still act as a shadow configuration path

- Severity: medium
- Area: architecture
- Evidence from real code
  - `src/application/config/PluginSettings.ts` stores both `cardTypeConfigs[*].noteType` and legacy fields such as `qaNoteType`, `clozeNoteType`, and `semanticQaNoteType`.
  - `normalizePluginSettings()` derives the legacy fields back from `cardTypeConfigs`.
  - `src/application/services/RenderConfigService.ts :: resolveNoteModel()` reads the legacy fields instead of `cardTypeConfigs`.
- Why it matters
  - There are two representations for the same concept.
  - The code currently avoids divergence only by normalization discipline, which is weaker than having one source of truth.
- Recommended fix
  - Make `cardTypeConfigs` the only runtime authority.
  - Relegate legacy fields to one-way migration only.
- Estimated implementation size: M
- Risk level: medium
- Suggested test coverage
  - Migration tests from old settings snapshots.
  - Runtime note-model resolution tests that use only `cardTypeConfigs`.

### 4.7 AnkiConnect failures are not classified into health-check/offline UX

- Severity: medium
- Area: UX
- Evidence from real code
  - `src/infrastructure/anki/AnkiConnectGateway.ts :: invoke()` calls `requestUrl()` without an explicit timeout parameter.
  - `src/presentation/AnkiHeadingSyncPlugin.ts :: runSyncCurrentFile()` and `runSyncVault()` catch generic errors and pass them through `renderUnknownUserFacingError()`.
  - `src/application/errors/PluginUserError.ts :: toUserFacingMessage()` falls back to raw error text for ordinary `Error` instances.
- Why it matters
  - “Anki is not running”, “wrong URL”, “timed out”, and “AnkiConnect returned an action error” are different user problems but converge to a generic failure path.
  - This weakens first-run UX and troubleshooting.
- Recommended fix
  - Add a dedicated gateway health-check method, explicit timeout handling, and user-facing offline messaging.
  - Surface that in settings as a check button or status line.
- Estimated implementation size: M
- Risk level: low
- Suggested test coverage
  - Gateway timeout test.
  - Plugin-level offline error rendering test.
  - Settings health-check UI test.

### 4.8 Clear-current-file reset deletes remote notes before markdown cleanup succeeds

- Severity: high
- Area: sync correctness
- Evidence from real code
  - `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.ts :: execute()` deletes note IDs through `ankiGateway.deleteNotes(noteIds)` before calling `markdownMarkerRemovalService.remove(...)`.
  - The result can still contain `conflictFiles` and `failureFiles`, meaning markdown cleanup can fail after remote deletion has already happened.
- Why it matters
  - A user can end up with deleted Anki notes but stale markers/local traces in Markdown.
  - There is no rollback path.
- Recommended fix
  - Make reset more recoverable:
    - either remove local markers/state first and mark remote deletion as pending,
    - or add a two-phase result model with resumable cleanup.
- Estimated implementation size: M
- Risk level: high
- Suggested test coverage
  - Conflict during marker removal after remote deletion.
  - Restart/resume after partial reset.

### 4.9 Batch sync is non-transactional across create/update/tag/deck/media phases

- Severity: high
- Area: sync correctness
- Evidence from real code
  - `src/application/services/AnkiBatchExecutor.ts :: execute()` performs deck ensure, media upload, note create, note update, model migration, tag sync, and deck migration in separate phases.
  - There is no rollback or checkpoint reconciliation when a later phase fails after earlier remote mutations already succeeded.
- Why it matters
  - Partial AnkiConnect failure can leave the remote state ahead of the local marker/state write-back pipeline.
  - The plugin already tries to recover marker writes, but not the whole multi-phase sync transaction.
- Recommended fix
  - Introduce a resumable execution journal or a narrower phase-by-phase recovery strategy.
  - At minimum, classify remote progress in the saved state when later phases fail.
- Estimated implementation size: L
- Risk level: high
- Suggested test coverage
  - Partial failure after note creation but before tag/deck sync.
  - Partial failure after model migration.

### 4.10 Test doubles are too optimistic for real Anki multi-request failure behavior

- Severity: medium
- Area: testing
- Evidence from real code
  - `src/test-support/manualSyncFakes.ts :: FakeManualSyncAnkiGateway` batch methods (`addNotes`, `updateNotes`, `changeDecks`, `storeMediaFiles`) always succeed and do not simulate per-item or top-level multi failures.
  - The real adapter in `src/infrastructure/anki/AnkiConnectGateway.ts` uses `multi` requests and already contains per-item error parsing logic for some actions.
- Why it matters
  - Service-level tests can pass while still underrepresenting real-world failure modes.
  - This is one reason the code has many happy-path tests but weaker evidence around partial remote failures.
- Recommended fix
  - Add failure-capable fake gateways or integration-style adapter fixtures that can simulate:
    - top-level `multi` errors
    - partial per-action failures
    - timeouts / transport errors
- Estimated implementation size: M
- Risk level: low
- Suggested test coverage
  - `AnkiBatchExecutor` partial failure cases.
  - `ManualSyncService` recovery after transport failure.

## 5. Improvement backlog

### P0: must fix soon

- Persist `pendingWriteBack` on load and restart.
- Harden destructive reset so remote deletion cannot silently outrun local cleanup.
- Add AnkiConnect timeout/health classification and user-facing offline guidance.
- Add at least one resumable or checkpointed strategy for partial remote sync failure.

### P1: high value

- Resolve semantic QA runtime/UI mismatch.
- Unify QA Group model authority and remove dormant managed-model branch or fully adopt it.
- Collapse note-model authority onto `cardTypeConfigs` only.
- Expose rebuild index or remove the dormant entry point.
- Refactor `PluginSettingTab` into smaller modules.
- Improve failure-capable test doubles and add failure-path integration tests.

### P2: nice to have

- Improve locale handling so `zh-*` variants do not fall back to English by design.
- Move `query_note.js` and `query_notes.js` into an explicit debug/scripts area or remove them.
- Simplify build/release documentation around root `main.js` vs `dist/plugin/main.js`.
- Add a small settings-page connection test/diagnostic panel.

### P3: later exploration

- Dry-run or preview mode before sync.
- Richer conflict explanation UI for marker-write conflicts.
- Lightweight performance telemetry for large-vault scans.

## 6. Recommended next development plans

### Module 1: Persist pending write-back across restart

- Goal
  - Make marker conflict recovery survive plugin reloads.
- Why it matters
  - The current design already depends on `pendingWriteBack`, but load discards it.
- Files likely to change
  - `src/infrastructure/persistence/DataJsonPluginStateRepository.ts`
  - `src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts`
  - Possibly `src/domain/manual-sync/entities/PluginState.ts`
- Implementation outline
  - Distinguish legacy migration from modern-state passthrough.
  - Preserve modern `pendingWriteBack` entries.
  - Validate marker kinds and required fields on load.
- Tests to add
  - Save/load round-trip for modern pending entries.
  - Recovery after conflict across repository reload.
- Risk
  - Medium
- Suggested prompt title
  - `Persist Pending Writeback Recovery`

### Module 2: Add Anki health check and timeout-aware UX

- Goal
  - Turn Anki offline/slow scenarios into clear, recoverable UX.
- Why it matters
  - Current transport errors are too generic for first-run and troubleshooting.
- Files likely to change
  - `src/infrastructure/anki/AnkiConnectGateway.ts`
  - `src/presentation/AnkiHeadingSyncPlugin.ts`
  - `src/presentation/settings/PluginSettingTab.ts`
  - `src/presentation/i18n/messages/en.ts`
  - `src/presentation/i18n/messages/zh.ts`
- Implementation outline
  - Add ping/health-check action.
  - Add explicit timeout handling.
  - Surface health result in settings and sync command failures.
- Tests to add
  - Gateway timeout/offline tests.
  - Settings health-check UI tests.
  - Plugin command offline-notice tests.
- Risk
  - Low
- Suggested prompt title
  - `AnkiConnect Health Check UX`

### Module 3: Bring semantic QA to product parity

- Goal
  - Stop having semantic QA exist only half-way between runtime and settings.
- Why it matters
  - Users need explicit control over all active sync-capable card types.
- Files likely to change
  - `src/presentation/settings/PluginSettingTab.ts`
  - `src/presentation/settings/PluginSettingTab.test.ts`
  - `src/application/config/PluginSettings.ts`
  - `src/application/services/NoteFieldMappingService.ts`
  - `src/application/services/RenderConfigService.ts`
- Implementation outline
  - Expose semantic QA in settings with note-type and field mapping.
  - Or gate parser/runtime support behind explicit availability.
- Tests to add
  - Settings rendering and persistence tests.
  - Semantic QA sync path with configured mapping.
- Risk
  - Medium
- Suggested prompt title
  - `Semantic QA Settings Parity`

### Module 4: Harden clear-current-file reset

- Goal
  - Make reset resumable and safer under write conflicts or partial failures.
- Why it matters
  - Current order can delete remote data before local cleanup finishes.
- Files likely to change
  - `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.ts`
  - `src/application/services/MarkdownSyncedMarkerRemovalService.ts`
  - `src/infrastructure/persistence/DataJsonPluginStateRepository.ts`
  - `src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.test.ts`
- Implementation outline
  - Add staged reset state or reorder the operation with recovery markers.
  - Preserve enough local state to retry cleanup safely.
- Tests to add
  - Conflict after remote delete.
  - Retry after restart.
- Risk
  - High
- Suggested prompt title
  - `Harden Clear Current File Reset`

### Module 5: Unify QA Group model authority

- Goal
  - Remove the split between user-selected QA Group models and dormant managed-model infrastructure.
- Why it matters
  - One codebase should tell one consistent QA Group story.
- Files likely to change
  - `src/application/services/QaGroupModelService.ts`
  - `src/application/services/QaGroupModelDefinition.ts`
  - `src/application/config/ManagedNoteModels.ts`
  - `src/application/services/QaGroupSyncService.ts`
  - `src/presentation/settings/PluginSettingTab.ts`
  - `src/presentation/i18n/messages/en.ts`
  - `src/presentation/i18n/messages/zh.ts`
- Implementation outline
  - Decide whether the plugin owns a managed QA Group model.
  - Remove or fully integrate the losing branch.
- Tests to add
  - End-to-end QA Group path for the chosen authority model.
  - Copy and settings tests matching the chosen UX.
- Risk
  - Medium
- Suggested prompt title
  - `Unify QA Group Model Authority`

### Module 6: Make `cardTypeConfigs` the sole note-model authority

- Goal
  - Complete the settings migration instead of keeping mirrored legacy fields alive.
- Why it matters
  - Shadow settings make future bugs more likely.
- Files likely to change
  - `src/application/config/PluginSettings.ts`
  - `src/application/services/RenderConfigService.ts`
  - `src/infrastructure/persistence/DataJsonPluginConfigRepository.ts`
  - `src/application/config/PluginSettings.test.ts`
- Implementation outline
  - Read note-model names directly from `cardTypeConfigs`.
  - Keep legacy values only for load-time migration.
- Tests to add
  - Old snapshot migration tests.
  - RenderConfigService tests for all card types.
- Risk
  - Medium
- Suggested prompt title
  - `Retire Legacy Note Type Mirrors`

### Module 7: Split the settings page by card and service

- Goal
  - Reduce the size and cognitive load of `PluginSettingTab.ts`.
- Why it matters
  - The settings page is now one of the main maintenance hotspots.
- Files likely to change
  - `src/presentation/settings/PluginSettingTab.ts`
  - New helpers/components under `src/presentation/settings/`
  - `src/presentation/settings/PluginSettingTab.test.ts`
- Implementation outline
  - Extract card-type card, deck card, scope card, and cache/mapping orchestration helpers.
  - Keep public UI behavior stable first.
- Tests to add
  - Preserve existing behavior with smaller focused tests.
- Risk
  - Medium
- Suggested prompt title
  - `Refactor Settings Page Cards`

## 7. Product suggestions

- Simplify settings mental model
  - Make every active sync-capable card type visible and configurable from one consistent card-type surface.

- Improve onboarding
  - Add a first-run AnkiConnect health check and a “what still needs configuration” summary.

- Add sync preview or dry-run mode
  - The existing plan/build architecture is already close to supporting a non-destructive preview step.

- Make error recovery explicit
  - Marker-write conflicts should tell the user what happened, what was already synced remotely, and how to retry safely.

- Add mapping confidence cues
  - Show whether a mapping is from live cache, stale cache, manual override, or incomplete selection.

- Explain conflicts in UI
  - Deck fallback warnings and mapping staleness already exist in code; present them earlier in settings or pre-sync diagnostics.

- Stop hardcoding old QA Group product language in user copy
  - Current strings still refer to `ObsiAnki QA Group 12` even though runtime sync now follows user-selected models.

## 8. Technical suggestions

- Tighten service boundaries
  - Move settings-page cache and mapping orchestration out of `PluginSettingTab`.

- Finish config migration
  - Keep one note-model authority path and one QA Group model strategy.

- Strengthen state invariants
  - `pendingWriteBack` should be durable, validated, and part of the explicit recovery model.

- Harden gateway contracts
  - Distinguish transport failure, top-level AnkiConnect error, and per-action multi failure.

- Clean dead or dormant branches
  - Remove unmanaged remnants like unused managed QA Group runtime services if they are not the chosen direction.

- Add lightweight performance instrumentation
  - File scan counts, skipped counts, and marker-conflict counts are already available and could be logged or surfaced in debug mode.

## 9. Testing suggestions

### Parser

- Add more pathological QA Group and semantic QA markdown cases:
  - mixed fences
  - repeated labels
  - ambiguous indentation
  - empty answer edge cases

### Mapping

- Add stale-field and partially renamed-field tests for basic, cloze, semantic QA, and QA Group mappings.
- Add tests for semantic QA settings once surfaced.

### Sync execution

- Add partial failure tests after remote note creation but before local write-back.
- Add restart/retry tests using persisted `pendingWriteBack`.

### Anki gateway

- Add timeout/offline tests.
- Add explicit `multi` partial failure tests for more actions than model-field loading.

### Settings UI

- Add tests for semantic QA controls if kept active.
- Add health-check and stale-cache status tests.

### Persistence / migration

- Add save/load tests that preserve `pendingWriteBack`.
- Add versioned migration tests for old settings snapshots after legacy field cleanup.

### Failure paths

- Add reset-conflict tests where remote deletion succeeds but local cleanup fails.
- Add deck cleanup partial-failure tests with mixed deletion outcomes.

### E2E / manual validation

- Validate against a real Anki instance for:
  - Anki offline
  - changed note model fields
  - QA Group model mismatch
  - marker conflict after editing the file between scan and write-back

## 10. Risks and non-goals

- Do not rewrite the whole plugin.
- Do not add more settings before fixing the current runtime/UI mismatches.
- Do not keep both user-selected QA Group models and dormant managed QA Group model code long term.
- Do not hide AnkiConnect transport errors under vague generic notices.
- Do not overfit field mapping heuristics to one language or one note template.
- Do not treat generated `main.js` or `dist/plugin/*` as the primary design surface.

## 11. Quick wins

- Add a rebuild-index command and list it in the settings command card.
- Treat `zh-CN` / `zh-TW` style locales as Chinese instead of falling back to English.
- Move `query_note.js` and `query_notes.js` under a `scripts/debug/` convention or delete them.
- Update QA Group settings copy to match the actual chosen product model.
- Add a settings-page “Check Anki connection” button.

## 12. Suggested implementation order

1. Persist `pendingWriteBack` correctly across save/load/restart.
2. Add AnkiConnect timeout + health-check + offline UX.
3. Harden clear-current-file reset against partial failure.
4. Resolve semantic QA runtime/UI mismatch.
5. Unify QA Group model authority.
6. Retire legacy note-type mirrors and make `cardTypeConfigs` authoritative.
7. Improve failure-capable test doubles and add partial-failure integration coverage.
8. Split the settings page into smaller card-scoped modules.