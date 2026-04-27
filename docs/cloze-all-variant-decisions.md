# Cloze All Variant Decisions

## Final config id

- New card type config id: `cloze-all`.

## Runtime card type decision

- Runtime `cardType` remains `cloze` for both Cloze variants.
- `cloze-all` is a recognition/config id, not a new runtime note-mapping type.

## Cloze mode shape and storage

- Add optional `clozeMode?: "sequential" | "all"` to `IndexedCard`.
- Indexing assigns:
  - `sequential` for normal `cloze`
  - `all` for `cloze-all`
- Missing or legacy mode is treated as `sequential`.
- No separate persisted card-state schema migration is required if the mode remains transient on indexed/render planning data and hash payload only.

## Rendering behavior

- Unnumbered clozes in sequential mode use `c1/c2/c3/...`.
- Unnumbered clozes in all mode use `c1/c1/c1/...`.
- Explicit numbering is preserved unchanged in both modes.

## Settings UI behavior

- Rename current `cloze` row label to `填空题（逐个挖空）`.
- Add `填空题（全部挖空）` row.
- `cloze-all` row shows only:
  - enabled toggle
  - heading level
  - extra marker
  - explanatory text that it reuses the same Cloze note type and main field
- `cloze-all` does not expose separate note type or field mapping controls.

## Shared mapping compatibility

- `cloze-all` reuses the same Cloze note type as `cloze`.
- `cloze-all` reuses the existing `cloze:<modelName>` mapping key.
- `getRuntimeCardType(configId)` and settings helpers are the compatibility seam for this reuse.

## Configured-count decision

- Count `cloze-all` as a separate enabled configured mode in the settings summary.
- The count is considered configured when the shared Cloze note type has cached fields available.
- This keeps the summary aligned with visible recognition modes while still reusing one mapping.

## Compatibility and migration

- Old settings missing `cloze-all` are normalized by adding the default config.
- Existing `cloze` config remains untouched.
- Existing Markdown and existing `#anki-cloze` behavior remain unchanged.

## Intentional deviation from the plan

- No new persisted plugin-state field is planned unless a later code path requires it; current repository structure supports the feature by carrying `clozeMode` on indexed/render-path data and by including it in render hashing.
