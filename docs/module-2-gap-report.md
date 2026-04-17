# Module 2 Gap Report

## Current State

- Card extraction only derives legacy card identity from heading structure and source position.
- `CardDraft` has no `embeddedNoteId` field.
- `SourceLocation` has no block-end marker positioning data beyond `blockEndLine`.
- `SyncRecord` only stores legacy `cardKey -> noteId` mappings.
- `SyncPlanningService` only matches cards by legacy `cardKey`.
- `ExecuteSyncPlanUseCase` only supports add/update driven by plan entries and never writes back into Markdown.
- `VaultGateway` cannot replace Markdown content with optimistic concurrency.
- `AnkiGateway` cannot batch-check note existence/model via `noteId`.

## Already Correct

- Card rendering is separate from extraction and can stay identity-agnostic.
- Sync registry persistence is already centralized in the shared plugin data snapshot.
- Execution already validates field mappings before side effects.
- Source scanning and sync execution are already split into `scan/plan` and `execute` phases.

## Missing For Module 2

### Extraction

- Parse block-end `<!-- AHS:<noteId> -->` markers.
- Reject malformed or duplicated markers in the same heading block.
- Exclude marker lines from `bodyMarkdown`.
- Populate `embeddedNoteId` and marker positioning metadata.

### Identity And Registry

- Extend `SyncRecord` with `identityMode` and optional `legacyCardKey`.
- Keep legacy `cardKey` lookup while adding embedded `noteId` lookup.
- Preserve pending write-back state when Anki note creation succeeds but Markdown write-back fails.

### Planning

- Prefer embedded `noteId` over legacy `cardKey` when available.
- Allow embedded-note-id cards to update even if the local registry entry is missing.
- Detect orphans independently for embedded-note-id and legacy-card-key records.

### Execution

- Validate embedded `noteId` existence/model before update.
- Recreate missing embedded-note-id notes and replace the block-end marker.
- Write back a new marker for newly created notes.
- Reject basic/cloze type switches for embedded-note-id cards.
- Retry pending marker write-back on later legacy hits.

### Infrastructure

- Add `VaultGateway.replaceMarkdownFile(path, expectedContent, nextContent)`.
- Implement block-end marker replacement in the Obsidian gateway.
- Add `AnkiGateway.getNoteSummaries(noteIds)` and AnkiConnect implementation.

### Tests Missing

- Extraction tests for valid, duplicate, and malformed AHS markers.
- Planning tests for embedded `noteId` precedence and mixed orphan detection.
- Execution tests for write-back success/failure, recreation, and type-switch rejection.
- Gateway tests for `getNoteSummaries` and optimistic Markdown replacement.