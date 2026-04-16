# Module 1 Gap Report

## What Is Already Correct

- `AnkiConnectGateway.getModelDetails(modelName)` already reads field names from Anki.
- `qaNoteType` and `clozeNoteType` are already persisted in plugin settings.
- `CardRenderingService` already renders heading and body separately before assigning them to Anki-facing fields.

## Gaps Against Module 1 Spec

- `AnkiGateway` does not expose `listNoteModels()`, so settings cannot populate note type dropdowns from Anki.
- `PluginSettings` has no `noteFieldMappings`, so there is no persisted, note-type-specific field mapping.
- Settings UI still uses free-text note type inputs and has no field-loading, mapping dropdowns, or saved-state feedback.
- `NoteFieldMappingService` still relies on heuristic fallback guesses (`Front`/`Back`, `Text`/`Extra`) during sync.
- Sync execution does not block when mappings are missing or stale.
- Cloze output is still treated as `text` + `extra`, not `title + <br><br> + body` into one mapped main field.
- There is no migration coverage proving old settings load with empty `noteFieldMappings`.
- There are no tests for note type list loading, mapping persistence, stale mapping validation, or settings UI mapping flow.

## Focused Repair Plan

1. Add persisted `NoteModelFieldMapping` and migrate settings load/save to default `noteFieldMappings` to `{}`.
2. Replace heuristic sync mapping with configuration-driven mapping + validation.
3. Add `listNoteModels()` to the Anki gateway and wire settings UI to Anki-backed dropdowns.
4. Persist confirmed mappings per `${cardType}:${modelName}` and block sync when missing or stale.
5. Update rendering semantics so sync assignment is driven by title/body fragments.
6. Add targeted tests for gateway, settings persistence, mapping validation, UI flow, and sync gating.

## Blockers

- No concrete repository blocker found at audit time.