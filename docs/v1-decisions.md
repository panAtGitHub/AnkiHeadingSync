# V1 Decisions

This file is the authoritative lock for V1 implementation behavior.
If an implementation detail conflicts with this file, this file wins.

## Product Boundary

- Obsidian is the only source of truth.
- Sync direction is only Obsidian -> Anki.
- Card authoring is heading-paragraph based only.
- V1 is intentionally narrow and does not become a generic syntax platform.

## Heading Policy

- Default QA heading level is H4.
- Default Cloze heading level is H5.
- QA and Cloze heading levels are configurable.
- QA and Cloze heading levels must not be equal.

## Card Identity

- `cardKey` is computed as:

  `hash(filePath + headingLevel + headingText + blockStartLine + cardType)`

- V1 accepts instability caused by:
  - heading rename
  - file move
  - line-number shifts

- V1 does not introduce:
  - hidden source ids
  - anchor-based identity
  - persistent block ids

## Field Mapping

### Basic

- Front = heading
- Back = body

### Cloze

- Text = body
- Extra = heading

### Model Resolution

- QA note type is configurable and defaults to `Basic`.
- Cloze note type is configurable and defaults to `Cloze`.
- V1 uses queried Anki model field names plus small heuristics.
- V1 does not introduce a full user-facing field-mapping UI.

## Deck Resolution

Deck resolution order is:

1. file-level `TARGET DECK`
2. plugin default deck

V1 does not implement:

- folder -> deck mapping
- path-derived deck rules
- per-heading deck overrides

## Scan Scope

- `includeFolders` empty => scan all markdown files in the vault
- `includeFolders` non-empty => scan only files under included folders
- `excludeFolders` always applies
- only markdown files are candidates
- no glob DSL is supported in V1

## Sync Behavior

- V1 supports deck creation.
- V1 supports note add.
- V1 supports note update.
- V1 supports media upload.
- V1 supports incremental sync through local sync records.
- V1 supports orphan detection.

### Orphan Handling

- detect and mark only
- never auto-delete in V1
- deletion remains out of scope unless a future explicit manual workflow is added

## Rendering Target

- prioritize readability and reviewability in Anki
- preserve math where practical
- preserve code blocks and inline code where practical
- preserve links and media where practical
- preserve Obsidian backlinks where enabled
- do not chase pixel-perfect Obsidian rendering fidelity

## Explicitly Out Of Scope For V1

- bidirectional sync
- Anki -> Obsidian writeback
- Python tooling or sidecar CLI
- folder -> deck mapping
- folder -> tag mapping
- generic regex syntax systems
- inline note systems
- begin/end note block systems
- automatic orphan deletion
- complex glob or scan DSLs