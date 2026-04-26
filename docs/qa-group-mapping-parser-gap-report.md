# QA Group Mapping / Parser Gap Report

## Audit Baseline

- Sync-side authority for QA Group was already correct before this change: sync used saved slots and only validated field existence.
- Settings UI was still under-specified: users could only change the title field and see an auto-detected slot summary.
- QA Group field detection still depended on fixed question/answer naming heuristics and could not persist a user-selected first pair.
- QA Group parsing still truncated answers to the first direct second-level list item label.
- Stale Cloze compatibility remnants still existed in `NoteModelDetails.isCloze` and the unused `clozeIncompatible` i18n copy.

## Closed Gaps

- Added optional QA Group derivation metadata so settings can persist the first selected question/answer pair while keeping concrete slots as sync authority.
- Refactored QA Group field derivation to support “choose the first pair once, derive the rest automatically”.
- Updated the QA Group settings UI to expose:
  - title field
  - first question field
  - first answer field
  - configured pair count with first/last example
- Changed field refresh behavior so only mappings with derivation metadata are regenerated from the latest Anki fields.
- Preserved old explicit QA Group slot mappings when no derivation metadata exists.
- Updated the QA Group parser so answers now keep the full child block markdown, including multiline text, nested lists, and code fences.
- Removed stale `NoteModelDetails.isCloze` metadata and deleted the dead `clozeIncompatible` copy.

## Intentional Compatibility Rules

- Old QA Group mappings with explicit slots and no derivation metadata continue to work unchanged.
- New QA Group mappings no longer emit incomplete-tail warnings during suggestion; they derive continuous pairs from the selected first pair and stop at the first missing complete pair.
- Simple QA Group answers that were previously represented as a single nested bullet still serialize to the same plain-text answer where practical.

## Validation Status

- Focused tests passed for:
  - QA Group field derivation service
  - plugin settings normalization / validation
  - settings UI behavior
  - QA Group parser behavior
  - sync / gateway / batch executor slices touched by `NoteModelDetails`
