# V1 Gap Report

## Audit Summary

The current implementation is already close to the memo's intended V1 surface.
It passes its existing tests, build, and lint, and it already supports the main heading-paragraph workflow.

The remaining problems are not a full-rewrite problem.
They are a focused repair problem:

1. a few DDD boundaries are still leaking,
2. some V1 product decisions are implemented only implicitly,
3. the build pipeline does not yet produce a ready-to-sync plugin package by itself,
4. a few important V1 behaviors are not directly protected by tests.

## What Already Aligns With The Memo

- Obsidian is treated as the only source of truth.
- Sync direction is one-way only: Obsidian -> Anki.
- Card authoring is heading-paragraph based.
- Default heading levels are H4 for QA and H5 for Cloze.
- Equal QA and Cloze heading levels are rejected.
- `TARGET DECK` is supported as a file-level override.
- Default deck, QA note type, and Cloze note type are configurable.
- Include/exclude folder scanning exists and is markdown-only.
- Add, update, deck creation, media upload, incremental sync, and orphan marking are implemented.
- Auto-delete for orphan cards is not implemented.
- Rendering already covers markdown, math, code, wikilinks, image embeds, audio embeds, and Obsidian backlinks.

## V1 Scope Drift Or Delivery Gaps

### 1. Build output was not fully productized

The bundle was emitted to a build folder, but the full plugin package still depended on a manual follow-up step to copy:

- `manifest.json`
- `versions.json`
- a small distribution README

That is a delivery gap for a plugin project because the build should produce a ready-to-sync package folder directly.

### 2. V1 decisions were not locked in a dedicated authoritative document

The repository had an implementation plan, but not a dedicated V1 decisions document that explicitly locks:

- cardKey strategy
- Basic field mapping
- Cloze field mapping
- orphan behavior
- scan scope behavior
- explicit out-of-scope items

That makes future edits more likely to drift.

## DDD Boundary Violations

### 1. Domain rendering depended on an application-layer port

`CardRenderingService` imported `RenderResourceResolver` from `application/ports`.

This is a direct layering leak because the rendering contract is part of the domain-facing rendering boundary and should be owned below, or at least alongside, the domain rather than above it.

### 2. Anki port depended on a service-owned DTO

`AnkiGateway` depended on `NoteModelDetails` exported from `NoteFieldMappingService`.

That couples an application port to a concrete service file rather than to a neutral DTO/contract.

### 3. Sync registry lifecycle was application-heavy

The registry entity already existed, but the execution use case still assembled several lifecycle transitions directly with raw object spreads.

That is acceptable for a quick implementation, but it under-expresses the memo's intent that sync lifecycle should be a first-class domain concern.

## Missing Or Weakly Protected Tests

The current suite is good, but two V1-critical areas were still under-protected:

1. plugin-level heading validation was not directly tested through `PluginSettings`
2. execute-time orphan marking behavior was not directly tested in the execution use case itself

## Decisions Implemented Implicitly But Not Clearly Locked

These decisions already existed in code, but were not written down as authoritative V1 decisions:

- card identity uses `hash(filePath + headingLevel + headingText + blockStartLine + cardType)`
- Basic cards map heading to Front and body to Back
- Cloze cards map body to Text and heading to Extra
- orphan handling marks records only and never auto-deletes
- scan scope is include-first, exclude-always, markdown-only
- rendering targets readability and reviewability rather than pixel-perfect Obsidian fidelity
- model field mapping uses minimal heuristics instead of a full field-mapping UI

## Repair Plan

1. Add `docs/v1-decisions.md` and lock V1 behavior explicitly.
2. Move rendering resource contracts to a domain-owned boundary.
3. Move note model details into a neutral DTO contract.
4. Tighten sync registry lifecycle so execution uses domain methods instead of ad hoc object rewrites.
5. Make the build emit a ready-to-sync plugin package in one folder.
6. Add targeted tests for plugin settings validation and execute-time orphan handling.

## Non-Goals For This Repair Pass

- No bidirectional sync.
- No folder-to-deck or folder-to-tag mapping.
- No generic syntax platform.
- No Python tooling.
- No automatic orphan deletion.
- No anchor-based or hidden-source identity scheme.