# Remove Managed QA Group 12 Decisions

## Final files to delete

- `src/application/config/ManagedNoteModels.ts`
- `src/application/services/QaGroupModelDefinition.ts`
- `src/application/services/QaGroupModelService.ts`
- `src/application/services/QaGroupModelService.test.ts`

## Final gateway methods and types to remove

- Remove from `AnkiGroupGateway` and corresponding implementations/tests:
  - `getModelTemplates`
  - `getModelStyling`
  - `createModel`
  - `addModelField`
  - `addModelTemplate`
  - `updateModelTemplate`
  - `updateModelStyling`
- Remove managed-model-only types:
  - `AnkiModelTemplate`
  - `CreateAnkiModelInput`

## Final AnkiConnectGateway cleanup

- Remove the AnkiConnect action wrappers that only serve the deleted managed model path:
  - `modelTemplates`
  - `modelStyling`
  - `createModel`
  - `modelFieldAdd`
  - `modelTemplateAdd`
  - `updateModelTemplates`
  - `updateModelStyling`

## Current QA Group path preserved

- Preserve `QaGroupSyncService` as the active runtime path.
- Preserve `QaGroupFieldMappingService` as the active mapping/slot authority.
- Preserve user-selected QA Group note types via `settings.cardTypeConfigs["qa-group"].noteType`.
- Preserve saved mappings keyed by `qa-group:<modelName>`.
- Preserve GI marker, slot, deck, tag, backlink, and clear-current-file behavior unchanged.

## Test update strategy

- Delete managed model service tests.
- Remove AnkiConnectGateway tests that only cover deleted model-management methods.
- Update remaining tests to use neutral example model names such as `QA Group List`.
- Keep QA Group sync and QA Group field mapping tests as the regression guard for the real active path.

## Active wording cleanup strategy

- Ensure active source/tests/README/manifest do not keep the old managed QA Group 12 route.
- Historical docs are intentionally excluded from bulk rewrite.

## Intentionally retained references

- Old QA Group 12 references in historical docs remain for audit history.
- Generic model-reading methods still used by active settings and sync paths remain untouched:
  - `listNoteModels`
  - `getModelDetails`
  - `getModelFieldNames`
  - `getModelFieldNamesByModelNames`
  - `updateNoteModel`

## Intentional deviations from the plan

- `manifest.json` and `README.md` do not need changes in this round because current repository reality already removed the old managed QA Group 12 wording from those active files.
- Internal QA Group sync semantics are intentionally unchanged; this round is dead-code removal only.
