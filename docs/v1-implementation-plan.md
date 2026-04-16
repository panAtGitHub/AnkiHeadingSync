# V1 Implementation Plan

This file locks the concrete V1 implementation decisions before major coding.

## Scope

- Direction is only Obsidian -> Anki.
- Obsidian content is the only source of truth.
- Card authoring is heading-paragraph based only.
- V1 supports only Basic and Cloze cards.
- V1 supports add, update, media upload, deck creation, incremental sync, and orphan marking.
- V1 does not support bidirectional sync, Python tooling, generic syntax platforms, or orphan auto-delete.

## Concrete V1 Decisions

- Project is implemented in TypeScript only.
- Architecture is split into domain, application, infrastructure, and presentation layers.
- Default heading levels are H4 for Basic and H5 for Cloze.
- Validation rejects equal QA and Cloze heading levels.
- Card identity is generated as a hash of file path, heading level, heading text, block start line, and card type.
- File-level deck override is parsed from a literal TARGET DECK line.
- Scan scope is folder include/exclude only. No glob DSL is supported.
- When includeFolders is empty, the whole vault is scanned for Markdown files.
- Exclude folders always filter candidates.
- Cloze cards render body content into the cloze field and heading into an auxiliary context field.
- Orphan handling only marks local records as orphan. It never deletes Anki notes.

## Rendering Decisions

- Markdown rendering uses a focused pipeline tuned for Anki output rather than trying to reproduce the entire Obsidian renderer.
- Obsidian math is preserved as MathJax-compatible inline and display markup.
- Wikilinks become obsidian:// backlinks where possible.
- Image embeds render to HTML img tags after media upload.
- Audio embeds render to Anki sound tags after media upload.
- Inline code and fenced code blocks are preserved through markdown rendering.

## Note Model Assumptions

- Basic note type defaults to Basic and maps to front/back style fields.
- Cloze note type defaults to Cloze and maps body into a text field and heading into an auxiliary field such as Extra.
- V1 resolves model field names by querying AnkiConnect and applying small heuristics rather than exposing a full field mapping system.

## Validation Plan

- Unit tests cover extraction, identity, deck resolution, rendering, sync planning, scan scope behavior, persistence, and application use cases.
- Final validation runs npm test, npm run build, and npm run lint.