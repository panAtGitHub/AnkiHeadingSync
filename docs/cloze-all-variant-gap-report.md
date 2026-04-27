# Cloze All Variant Gap Report

## Scope

This report records the real repository state before adding the new `cloze-all` recognition variant.

## Current Cloze recognition flow

- Card type recognition is driven by `cardTypeConfigs` in `PluginSettings.ts`.
- Current config ids are `basic`, `qa-group`, and `cloze`.
- `CardIndexingService.ts` resolves headings by:
  - enabled config
  - matching heading level
  - matching extra marker suffix when present
  - falling back to the empty-marker row only if no marker row matched
- Current Cloze recognition is the `cloze` config only.
- Current default Cloze recognition is `H4 + #anki-cloze`.
- Indexed normal cards currently only carry `cardType: "basic" | "cloze"`; there is no Cloze mode metadata yet.

## Current Cloze render and numbering flow

- `ManualCardRenderer.ts` converts unnumbered highlight or brace cloze segments into Anki native cloze markup.
- Current auto-numbering is always sequential because the renderer uses a local `nextClozeIndex` counter.
- Explicit numbering is already preserved because the renderer prefers the parsed explicit index when present.
- Current behavior already preserves:
  - `{c2:内容}` as `c2`
  - `{{c2::内容}}` as `c2`
- Current render config hashing is handled by `RenderConfigService.ts`.
- The render config hash does not currently include any Cloze-mode discriminator.

## Current settings table behavior

- Visible settings rows are controlled by `VISIBLE_CARD_TYPE_CONFIG_IDS` in `PluginSettingTab.ts`.
- Current visible rows are `basic`, `qa-group`, and `cloze`.
- `getRuntimeCardType(configId)` already separates config id from runtime mapping type.
- `cloze` currently shows:
  - enabled toggle
  - heading level
  - extra marker
  - note type selector
  - main field selector
- Field mapping cache hydration and configured-count logic currently assume each visible config resolves its own note type.

## Exact model and type changes needed

- Add a new config id: `cloze-all`.
- Extend default card type configs and normalization so old settings missing `cloze-all` are backfilled safely.
- Keep runtime `cardType` as `cloze` for both `cloze` and `cloze-all`.
- Add optional `clozeMode` metadata to `IndexedCard`.
- Have indexing emit:
  - `clozeMode: "sequential"` for `cloze`
  - `clozeMode: "all"` for `cloze-all`
- Update `ManualCardRenderer` to use `clozeMode` when assigning numbers to unnumbered cloze segments.
- Update `RenderConfigService` so hash payload includes `clozeMode` with legacy fallback to `sequential`.
- Update settings-page helpers so `cloze-all` reuses the existing Cloze note type and mapping instead of introducing a new one.

## Tests likely to change

- `src/application/config/PluginSettings.test.ts`
- `src/presentation/settings/PluginSettingTab.test.ts`
- `src/domain/manual-sync/services/CardIndexingService.test.ts`
- `src/domain/manual-sync/services/ManualCardRenderer.test.ts`
- tests for render config hash or diff behavior around `RenderConfigService` / diff planning

## Risk points

- Adding a new config id affects exhaustive loops over `CARD_TYPE_CONFIG_IDS` and visible row lists.
- `cloze-all` must not create or require a second Cloze field mapping entry.
- Configured-count and cache hydration logic in the settings page must stay internally consistent when one visible row reuses another row's model and mapping.
- Marker matching must stay unambiguous when both `#anki-cloze` and `#anki-cloze-all` are enabled on the same heading level.
- Render hash must change when switching between sequential and all mode, or Anki updates will be skipped.
