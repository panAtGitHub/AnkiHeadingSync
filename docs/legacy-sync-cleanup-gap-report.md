# Legacy Sync Cleanup Gap Report

## Scope audited

- Runtime entry: `src/presentation/AnkiHeadingSyncPlugin.ts`
- Current manual-sync path: `ManualSyncService`, `ManualSyncCurrentFileUseCase`, `ManualSyncVaultUseCase`, `RebuildCardIndexUseCase`
- Legacy sync path: `ScanAndPlanSyncUseCase`, `ExecuteSyncPlanUseCase`, `SyncCurrentFileUseCase`, `SyncVaultUseCase`, `SyncRegistryRepository`, `DataJsonSyncRegistryRepository`, `HeadingSyncMarkerService`, `src/domain/sync/**`, `CardExtractionService`
- Mixed-use boundary: `DataJsonPluginConfigRepository`, `NoteFieldMappingService`, `domain/card` shared types

## Findings

### 1. Current production runtime is already manual-sync only

- `src/presentation/AnkiHeadingSyncPlugin.ts` instantiates only:
  - `ManualSyncService`
  - `ManualSyncCurrentFileUseCase`
  - `ManualSyncVaultUseCase`
  - `RebuildCardIndexUseCase`
  - management use cases built on `pluginState`
- No production initialization path constructs or invokes the legacy sync chain.

### 2. Legacy sync chain is isolated from the current runtime

- Production references to legacy use cases are confined to the legacy chain itself.
- `ScanAndPlanSyncUseCase` depends on `CardExtractionService`, `SyncPlanningService`, and `SyncRegistryRepository`.
- `ExecuteSyncPlanUseCase` depends on `HeadingSyncMarkerService`, `SyncRegistryRepository`, `SyncRegistry`, `SyncRecord`, and legacy sync result types.
- `SyncCurrentFileUseCase` and `SyncVaultUseCase` are thin wrappers over the two legacy use cases.
- Current manual-sync code does not import `src/domain/sync/**` or `DataJsonSyncRegistryRepository`.

### 3. `syncRegistry` is legacy-only compatibility residue

- `DataJsonPluginConfigRepository` still carries `PluginDataSnapshot.syncRegistry`, but the repository only loads and saves `settings`.
- Current runtime persistence uses `DataJsonPluginStateRepository` and `pluginState`; it does not consume `syncRegistry`.
- The remaining `syncRegistry` production references are inside the legacy chain and its repository.

### 4. Legacy identity modes are not part of current manual-sync state

- `embedded-note-id`, `legacy-card-key`, and `pending-note-id-write` are only present in legacy sync types, repository code, tests, and compatibility docs.
- Current manual-sync persistence uses `pluginState.cards`, `pluginState.files`, `groupBlocks`, and `pendingWriteBack`; it does not persist legacy identity modes.

### 5. Shared card-domain types must stay

- Confirmed current non-legacy usage exists for:
  - `RenderedFields`
  - `MediaAsset`
  - `SourceFile`
  - `SourceLocation`
  - `CardType`
  - `RenderResourceResolver`
  - `CardKey`
  - `ContentHash`
- These are used by current manual-sync services, vault/Anki gateways, rendering, write-back, and test support.

### 6. `Card.ts` is only kept alive by legacy code plus one current type import

- `NoteFieldMappingService` imports `Card` only for method signatures and `Card["type"]`.
- The service already has a smaller `RenderedCardInput` shape, so current code can be decoupled from `domain/card/entities/Card.ts`.
- After decoupling and legacy deletion, `Card.ts` can be removed if no remaining references exist.

### 7. Legacy-only tests and docs remain

- Legacy-only tests currently cover:
  - `ExecuteSyncPlanUseCase`
  - `SyncCurrentFileUseCase`
  - `SyncVaultUseCase`
  - `HeadingSyncMarkerService`
  - `DataJsonSyncRegistryRepository`
  - `src/domain/sync/**`
  - `CardExtractionService`
- Several docs still describe the legacy chain as an implementation surface rather than archived context.

## Cleanup implications

- Safe direct deletion candidates: legacy use cases, legacy repository port/implementation, marker service, `src/domain/sync/**`, and legacy-only tests.
- Mixed files requiring edits before or during deletion:
  - `src/infrastructure/persistence/DataJsonPluginConfigRepository.ts`
  - `src/application/services/NoteFieldMappingService.ts`
  - docs that still present the old chain as active
- Shared type modules under `src/domain/card` must be preserved unless a concrete post-cleanup search shows zero remaining references.