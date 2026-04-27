# Pre-release Remaining Fixes Decisions

## Pending writeback validation rules

- Preserve modern `PendingWriteBackState` entries during load only when all required fields are valid.
- Required fields:
  - `filePath`: non-empty string
  - `blockStartLine`: positive integer
  - `expectedFileHash`: non-empty string
  - `targetMarker`: non-empty string
  - `rawBlockHash`: non-empty string
  - `targetNoteId`: positive integer
- `markerKind` rules:
  - `undefined` is valid
  - `"card-id"` is valid
  - `"group-gi"` is valid
  - any other value is invalid and drops the item
- `targetGroupId` rules:
  - if absent, keep normal validation result
  - if present, it must be a non-empty string
  - malformed `targetGroupId` drops the item

## Legacy pending dropping rule

- Do not migrate legacy pending entries that only contain legacy identity fields such as `cardId` or `noteId`.
- Any pending entry missing `targetNoteId` is dropped.
- Do not synthesize or coerce malformed pending items into the modern shape.

## Old Semantic QA state dropping rule

- Current supported loaded card state remains limited to:
  - `basic`
  - `cloze`
- Removed card types such as `semantic-qa` are dropped during load.
- Unknown removed card types are also dropped during load.
- Dropped cards are not written into `state.cards`.
- File `noteIds` are rebuilt from the filtered migrated card map so dropped cards cannot leave dangling note IDs behind.

## README wording decision

- Replace `managed group notes` with current-product wording centered on multi-level list QA cards/notes.
- Keep the README change focused to the active feature description only.

## i18n wording decision

- Remove user-facing managed-model narrative from active settings copy.
- Replace old wording such as `QA Group 12`, `ObsiAnki QA Group 12`, `Managed note type`, and `Managed model contract` with current route wording for multi-level list QA notes.
- Keep internal model-definition constants unchanged unless a user-facing behavior requires a rename.

## Intentional deviations from the plan

- Internal technical constants such as `QA_GROUP_MODEL_NAME` are not renamed in this round because the requested cleanup is limited to active user-facing wording and persistence behavior.
- Historical audit docs are left untouched even if they still mention old QA Group 12 or Semantic QA history.
