import type { AnkiModelTemplate, CreateAnkiModelInput } from "@/application/ports/AnkiGateway";
import {
  DEFAULT_OBSIDIAN_BACKLINK_LABEL,
  type ObsidianBacklinkPlacement,
  normalizeObsidianBacklinkLabel,
} from "@/application/config/PluginSettings";
import type { GroupItem } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import { renderObsidianBacklinkAnchor } from "@/domain/shared/renderObsidianBacklink";

export const QA_GROUP_MODEL_NAME = "ObsiAnki QA Group 12";
export const QA_GROUP_SLOT_COUNT = 12;

interface QaGroupModelDefinitionOptions {
  obsidianBacklinkLabel?: string;
  obsidianBacklinkPlacement?: ObsidianBacklinkPlacement;
}

export function buildQaGroupModelDefinition(options: QaGroupModelDefinitionOptions = {}): CreateAnkiModelInput {
  const backlinkLabel = normalizeObsidianBacklinkLabel(options.obsidianBacklinkLabel ?? DEFAULT_OBSIDIAN_BACKLINK_LABEL);
  const backlinkPlacement = options.obsidianBacklinkPlacement ?? "answer-last-line";

  return {
    modelName: QA_GROUP_MODEL_NAME,
    fieldNames: buildQaGroupFieldNames(),
    templates: buildQaGroupTemplates(backlinkLabel, backlinkPlacement),
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

export function buildQaGroupTemplates(
  backlinkLabel = DEFAULT_OBSIDIAN_BACKLINK_LABEL,
  backlinkPlacement: ObsidianBacklinkPlacement = "answer-last-line",
): AnkiModelTemplate[] {
  const templates: AnkiModelTemplate[] = [];
  const backlinkAnchor = renderObsidianBacklinkAnchor({
    href: "{{Src}}",
    label: backlinkLabel,
    escapeHref: false,
  });
  const backlinkLine = `{{#Src}}<p>${backlinkAnchor}</p>{{/Src}}`;

  for (let slot = 1; slot <= QA_GROUP_SLOT_COUNT; slot += 1) {
    const slotId = formatQaGroupSlot(slot);
    templates.push({
      name: `Q${slotId.slice(1)}`,
      front: `{{#${slotId}_Q}}{{#${slotId}_A}}<div class="stem">{{Stem}}</div>\n<div class="q">{{${slotId}_Q}}</div>{{/${slotId}_A}}{{/${slotId}_Q}}`,
      back: buildQaGroupBackTemplate(slotId, backlinkLine, backlinkPlacement),
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

function buildQaGroupBackTemplate(
  slotId: string,
  backlinkLine: string,
  backlinkPlacement: ObsidianBacklinkPlacement,
): string {
  if (backlinkPlacement === "question-last-line") {
    return `{{FrontSide}}\n${backlinkLine}\n\n<hr id="answer">\n\n<div class="a">{{${slotId}_A}}</div>`;
  }

  if (backlinkPlacement === "answer-first-line") {
    return `{{FrontSide}}\n\n<hr id="answer">\n\n${backlinkLine}\n<div class="a">{{${slotId}_A}}</div>`;
  }

  return `{{FrontSide}}\n\n<hr id="answer">\n\n<div class="a">{{${slotId}_A}}</div>\n${backlinkLine}`;
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
