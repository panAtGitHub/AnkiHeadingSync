# QA Group Mapping / Parser Decisions

## Mapping Authority

- Concrete saved slots remain the runtime sync authority.
- Derivation metadata is settings-time metadata, not a runtime replacement for saved slots.

## First-Pair Derivation

- QA Group mappings now optionally persist:
  - `titleField`
  - `derivation.mode = "first-pair"`
  - `derivation.firstQuestionField`
  - `derivation.firstAnswerField`
- When both selected first fields contain a numeric segment:
  - use the last numeric segment in each field name
  - require both fields to start at the same index
  - require the first selected pair to start at `1`
  - preserve numeric width when generating later fields
  - stop at the first missing complete pair
- When one or both selected first fields have no numeric segment:
  - keep exactly one configured pair
  - do not try to auto-extend further pairs

## Refresh Behavior

- If a saved QA Group mapping has derivation metadata, reading fields from Anki regenerates slots from the stored first pair.
- If a saved QA Group mapping does not have derivation metadata, reading fields from Anki only refreshes `loadedFieldNames` and preserves the saved explicit slots.

## Parser Behavior

- QA Group answers now use the entire child block under each first-level item.
- The parser dedents the child block before storing it as answer markdown.
- If the child block is exactly one direct child list item, the parser unwraps that outer bullet so existing simple answers stay stable.
- If the child block contains multiple child bullets, paragraphs, nested lists, or fences, the parser keeps the markdown structure.

## Cloze Cleanup

- Removed `NoteModelDetails.isCloze` because sync no longer depends on Cloze-compatibility metadata.
- Kept `CreateAnkiModelInput.isCloze` because model creation still needs the AnkiConnect `createModel` contract.
- Removed the dead `clozeIncompatible` i18n message because no code path still emits it.
