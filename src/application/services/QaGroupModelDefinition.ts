import type { AnkiModelTemplate, CreateAnkiModelInput } from "@/application/ports/AnkiGateway";
import type { GroupItem } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";

export const QA_GROUP_MODEL_NAME = "ObsiAnki QA Group 12";
export const QA_GROUP_SLOT_COUNT = 12;

export function buildQaGroupModelDefinition(): CreateAnkiModelInput {
  return {
    modelName: QA_GROUP_MODEL_NAME,
    fieldNames: buildQaGroupFieldNames(),
    templates: buildQaGroupTemplates(),
    css: QA_GROUP_MODEL_CSS,
  };
}

export function buildQaGroupFieldNames(): string[] {
  const fieldNames = ["Stem", "GroupId", "Src"];

  for (let slot = 1; slot <= QA_GROUP_SLOT_COUNT; slot += 1) {
    const slotId = formatQaGroupSlot(slot);
    fieldNames.push(`${slotId}_Id`, `${slotId}_Q`, `${slotId}_A`);
  }

  return fieldNames;
}

export function buildQaGroupTemplates(): AnkiModelTemplate[] {
  const templates: AnkiModelTemplate[] = [];

  for (let slot = 1; slot <= QA_GROUP_SLOT_COUNT; slot += 1) {
    const slotId = formatQaGroupSlot(slot);
    templates.push({
      name: `Q${slotId.slice(1)}`,
      front: `{{#${slotId}_Q}}{{#${slotId}_A}}<div class="stem">{{Stem}}</div>\n<div class="q">{{${slotId}_Q}}</div>{{/${slotId}_A}}{{/${slotId}_Q}}`,
      back: `{{FrontSide}}\n\n<hr id="answer">\n\n<div class="a">{{${slotId}_A}}</div>\n{{#Src}}<p><a class="anki-heading-sync-backlink" href="{{Src}}">Open in Obsidian</a></p>{{/Src}}`,
    });
  }

  return templates;
}

export function buildQaGroupNoteFields(stem: string, groupId: string, src: string, items: GroupItem[]): Record<string, string> {
  const fields = Object.fromEntries(buildQaGroupFieldNames().map((fieldName) => [fieldName, ""]));
  fields.Stem = stem;
  fields.GroupId = groupId;
  fields.Src = src;

  for (const item of items) {
    if (!item.itemId || !item.slot) {
      continue;
    }

    const slotId = formatQaGroupSlot(item.slot);
    fields[`${slotId}_Id`] = item.itemId;
    fields[`${slotId}_Q`] = item.title;
    fields[`${slotId}_A`] = item.answer;
  }

  return fields;
}

export function formatQaGroupSlot(slot: number): string {
  return `S${String(slot).padStart(2, "0")}`;
}

export const QA_GROUP_MODEL_CSS = [
  ".card {",
  "  font-family: 'Helvetica Neue', Arial, sans-serif;",
  "  font-size: 22px;",
  "  line-height: 1.45;",
  "  text-align: left;",
  "}",
  "",
  ".stem {",
  "  font-size: 0.85em;",
  "  opacity: 0.72;",
  "  margin-bottom: 0.75em;",
  "}",
  "",
  ".q {",
  "  font-size: 1.25em;",
  "  font-weight: 700;",
  "  margin-bottom: 0.85em;",
  "}",
  "",
  ".a {",
  "  font-size: 1.08em;",
  "}",
  "",
  ".ahs-ob-tag {",
  "  display: inline-block;",
  "  box-sizing: border-box;",
  "  max-width: 100%;",
  "  margin: 0 4px 3px 0;",
  "  padding: 1px 8px;",
  "  border: 1px solid rgba(124, 101, 255, 0.16);",
  "  border-radius: 999px;",
  "  background: rgba(124, 101, 255, 0.12);",
  "  color: #5b4fd6;",
  "  font-size: 0.88em;",
  "  font-weight: 500;",
  "  line-height: 1.55;",
  "  vertical-align: baseline;",
  "  white-space: nowrap;",
  "  text-decoration: none;",
  "}",
  "",
  ".nightMode .ahs-ob-tag,",
  ".card.nightMode .ahs-ob-tag {",
  "  background: rgba(150, 135, 255, 0.18);",
  "  color: #c9c1ff;",
  "  border-color: rgba(150, 135, 255, 0.28);",
  "}",
  "",
  ".meta {",
  "  margin-top: 1.2em;",
  "  padding-top: 0.65em;",
  "  border-top: 1px solid rgba(0, 0, 0, 0.16);",
  "  font-size: 0.75em;",
  "  opacity: 0.72;",
  "}",
].join("\n");
