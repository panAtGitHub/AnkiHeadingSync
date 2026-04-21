# Legacy Sync Cleanup Decisions

## Runtime truth

- The only supported sync runtime after this cleanup is the `ManualSyncService` path.
- No legacy fallback will be preserved.
- Old `syncRegistry` data in data.json will be ignored and no migration will be implemented.

## Files safe to delete directly once imports are removed

- `src/application/use-cases/ScanAndPlanSyncUseCase.ts`
- `src/application/use-cases/ExecuteSyncPlanUseCase.ts`
- `src/application/use-cases/SyncCurrentFileUseCase.ts`
- `src/application/use-cases/SyncVaultUseCase.ts`
- `src/application/use-cases/types.ts`
- `src/application/services/HeadingSyncMarkerService.ts`
- `src/application/ports/SyncRegistryRepository.ts`
- `src/infrastructure/persistence/DataJsonSyncRegistryRepository.ts`
- `src/domain/sync/**`
- `src/domain/card/services/CardExtractionService.ts`
- legacy-only tests for the modules above

## Shared types to preserve

- Preserve these modules or exported types because current manual-sync still uses them:
  - `RenderedFields`
  - `MediaAsset`
  - `SourceFile`
  - `SourceLocation`
  - `CardType`
  - `RenderResourceResolver`
  - `CardKey`
  - `ContentHash`

## Mixed modules requiring partial extraction or reduction

- `src/infrastructure/persistence/DataJsonPluginConfigRepository.ts`
  - Remove `PluginDataSnapshot.syncRegistry` entirely.
  - Keep `settings` and `pluginState` support intact.
- `src/application/services/NoteFieldMappingService.ts`
  - Stop importing `Card` from `domain/card/entities/Card`.
  - Use the existing local render-shape input plus `CardType` directly.
- `src/domain/card/entities/Card.ts`
  - Delete only if a post-decoupling search shows no remaining production usage.

## Symbols that must disappear from production code

- `ScanAndPlanSyncUseCase`
- `ExecuteSyncPlanUseCase`
- `SyncCurrentFileUseCase`
- `SyncVaultUseCase`
- `SyncRegistry`
- `SyncRegistryRepository`
- `DataJsonSyncRegistryRepository`
- `HeadingSyncMarkerService`
- `legacy-card-key`
- `pending-note-id-write`

## Test and doc policy

- Delete tests that only validate the removed legacy chain.
- Keep and repair tests covering the current manual-sync runtime.
- Update or remove docs that still present the legacy chain as active implementation.
- Historical docs may remain only if they clearly read as archival context and no longer imply active runtime ownership.