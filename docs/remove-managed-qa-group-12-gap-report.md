# Remove Managed QA Group 12 Gap Report

## Scope

This report records the real repository state on 2026-04-27 before deleting the remaining dead managed QA Group model path.

## Active QA Group runtime path

- Active QA Group sync runs through `src/application/services/QaGroupSyncService.ts`.
- The current model name is loaded from `settings.cardTypeConfigs["qa-group"].noteType`.
- The current field mapping is loaded from `settings.noteFieldMappings[createNoteFieldMappingKey("qa-group", modelName)]`.
- `src/application/services/QaGroupFieldMappingService.ts` remains the authority for:
  - suggested QA Group field mappings
  - saved slot derivation
  - mapping validation
  - user-selected QA Group model support
- `src/presentation/settings/PluginSettingTab.ts` already builds and saves QA Group mappings against the selected note type.
- There is no current runtime call from QA Group sync or settings into the managed-model service path.

## Files confirmed as dead production code

- `src/application/config/ManagedNoteModels.ts`
  - only exports the old managed model constant
  - no active production path requires it
- `src/application/services/QaGroupModelDefinition.ts`
  - only builds the old managed model definition and templates
  - only referenced by the dead managed-model service and its tests
- `src/application/services/QaGroupModelService.ts`
  - no active production caller found
  - only references the old model management gateway methods

## Gateway methods confirmed as managed-model-only

- In `src/application/ports/AnkiGateway.ts`, the following `AnkiGroupGateway` methods are only used by the dead managed model path:
  - `getModelTemplates`
  - `getModelStyling`
  - `createModel`
  - `addModelField`
  - `addModelTemplate`
  - `updateModelTemplate`
  - `updateModelStyling`
- The following types are only used by those methods and related dead tests/fakes:
  - `AnkiModelTemplate`
  - `CreateAnkiModelInput`
- Search found no other active production call site for these methods outside:
  - `QaGroupModelService.ts`
  - `AnkiConnectGateway.ts`
  - tests and test fakes

## Tests to delete or update

- Delete:
  - `src/application/services/QaGroupModelService.test.ts`
- Update:
  - `src/infrastructure/anki/AnkiConnectGateway.test.ts`
    - remove model creation/template/styling wrapper tests
  - `src/application/services/QaGroupFieldMappingService.test.ts`
    - replace old example model name `ObsiAnki QA Group 12` with a neutral name
  - `src/test-support/manualSyncFakes.ts`
    - remove now-unused managed model gateway methods/types from the fake implementation

## References that may remain only in historical docs

- Historical docs under `docs/` still contain old QA Group 12 and managed model history.
- These are not active product surfaces and do not need bulk rewrite in this round.

## Risk points

- `AnkiConnectGateway.ts` and `AnkiGateway.ts` must be cleaned consistently so interface and implementation stay aligned.
- `src/test-support/manualSyncFakes.ts` must be updated with the same interface pruning or the test suite will break.
- The active QA Group path must keep:
  - user-selected note type resolution
  - saved field mappings
  - GI marker behavior
  - slot handling
  - deck sync
  - tag sync
  - backlink behavior
  - current-file cleanup behavior
