import MarkdownIt from "markdown-it";

import { createNoteFieldMappingKey, isQaGroupFieldMapping, type QaGroupFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { PluginSettings } from "@/application/config/PluginSettings";
import { PluginUserError } from "@/application/errors/PluginUserError";
import { createNoteTypeMigrationError } from "@/application/errors/noteTypeMigration";
import type { AnkiGroupGateway, AnkiNoteDetails } from "@/application/ports/AnkiGateway";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";
import { buildGroupSrc, type GroupItem, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { GroupBlockState, PluginState } from "@/domain/manual-sync/entities/PluginState";
import { GroupMarkerService, type GroupMarkerWriteRequest } from "@/domain/manual-sync/services/GroupMarkerService";
import { preprocessCardBodyMarkdown } from "@/domain/manual-sync/services/preprocessCardBodyMarkdown";
import { renderObsidianTagChipsInHtml } from "@/domain/manual-sync/services/renderObsidianTagChips";
import { DeckResolutionService } from "@/domain/manual-sync/services/DeckResolutionService";
import { getDeckResolutionWarningKey, type DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { hashString } from "@/domain/shared/hash";
import { applyObsidianBacklinkPlacement, renderObsidianBacklinkAnchor } from "@/domain/shared/renderObsidianBacklink";
import { diffTagSets } from "@/domain/manual-sync/services/tagSetUtils";

import { QaGroupFieldMappingService } from "./QaGroupFieldMappingService";

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: true,
});

const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const HIGHLIGHT_PATTERN = /==(.+?)==/g;

export interface QaGroupSyncExecutionResult {
  created: number;
  updated: number;
  migratedNoteTypes: number;
  migratedDecks: number;
  markerWrites: GroupMarkerWriteRequest[];
  resolvedNoteIds: Map<string, number>;
  touchedSyncKeys: string[];
  syncedGroupBlocks: GroupBlockState[];
  warnings: DeckResolutionWarning[];
}

interface GroupStateIndex {
  byGroupId: Map<string, GroupBlockState>;
  byNoteId: Map<number, GroupBlockState>;
  bySrc: Map<string, GroupBlockState[]>;
}

interface RecoveredGroupRecord {
  noteId?: number;
  groupId?: string;
  items: GroupItem[];
  freeSlots: number[];
  loadedNote?: LoadedQaGroupNote;
  stateRecord?: GroupBlockState;
}

type LoadedQaGroupNote =
  | { kind: "missing" }
  | { kind: "matching"; note: AnkiNoteDetails }
  | { kind: "model-mismatch"; note: AnkiNoteDetails; actualModelName: string; expectedModelName: string };

export class QaGroupSyncService {
  private sequence = 0;

  constructor(
    private readonly ankiGateway: AnkiGroupGateway,
    private readonly qaGroupFieldMappingService = new QaGroupFieldMappingService(),
    private readonly deckResolutionService = new DeckResolutionService(),
    private readonly groupMarkerService = new GroupMarkerService(),
    private readonly now: () => number = () => Date.now(),
    private readonly createGroupId: () => string = () => `g_${hashString(`${Date.now()}_${Math.random()}_${Date.now()}`).slice(0, 12)}`,
    private readonly createItemId: () => string = () => {
      this.sequence += 1;
      return `i_${hashString(`${Date.now()}_${this.sequence}_${Math.random()}`).slice(0, 10)}`;
    },
    private readonly createBacklink?: (location: SourceLocation) => string,
  ) {}

  async sync(blocks: IndexedGroupCardBlock[], state: PluginState, settings: PluginSettings): Promise<QaGroupSyncExecutionResult> {
    if (blocks.length === 0) {
      return {
        created: 0,
        updated: 0,
        migratedNoteTypes: 0,
        migratedDecks: 0,
        markerWrites: [],
        resolvedNoteIds: new Map(),
        touchedSyncKeys: [],
        syncedGroupBlocks: [],
        warnings: [],
      };
    }

    const { modelName, mapping, availableSlots, legacyInternalFields } = await this.resolveQaGroupModel(settings);

    const stateIndex = buildGroupStateIndex(state.groupBlocks ?? {});
    const ensuredDecks = new Set<string>();
    const warningMap = new Map<string, DeckResolutionWarning>();
    const markerWrites: GroupMarkerWriteRequest[] = [];
    const resolvedNoteIds = new Map<string, number>();
    const touchedSyncKeys = new Set<string>();
    const syncedGroupBlocks: GroupBlockState[] = [];
    let created = 0;
    let updated = 0;
    let migratedNoteTypes = 0;
    let migratedDecks = 0;
    const backlinkAnchor = this.buildGroupBacklinkAnchor(blocks[0] ?? null, settings);

    for (const block of blocks) {
      if (block.items.length > availableSlots.length) {
        throw new PluginUserError("errors.noteFieldMapping.qaGroupSlotCapacityExceeded", {
          modelName,
          capacity: availableSlots.length,
          itemCount: block.items.length,
          filePath: block.filePath,
          blockStartLine: block.blockStartLine,
        });
      }

      const recovered = await this.resolveRecoveredGroup(block, stateIndex, modelName, mapping, availableSlots);
      const groupId = recovered.groupId ?? block.groupId ?? this.createGroupId();
      const recoveredItems = normalizeRecoveredItemsForAvailableSlots(recovered.items, availableSlots);
      const resolvedItems = reconcileGroupItems(block.items, recoveredItems, this.createItemId, availableSlots);
      if (resolvedItems.length > availableSlots.length) {
        throw new PluginUserError("errors.noteFieldMapping.qaGroupSlotCapacityExceeded", {
          modelName,
          capacity: availableSlots.length,
          itemCount: resolvedItems.length,
          filePath: block.filePath,
          blockStartLine: block.blockStartLine,
        });
      }

      const freeSlots = buildFreeSlotsFromItems(resolvedItems, availableSlots);
      const deckResolution = this.deckResolutionService.resolve({
        filePath: block.filePath,
        deckHint: block.deckHint,
        deckHintSource: block.deckHintSource,
        deckWarnings: block.deckWarnings,
      } as never, settings);
      for (const warning of deckResolution.warnings) {
        warningMap.set(getDeckResolutionWarningKey(warning), warning);
      }

      const deck = deckResolution.resolvedDeck.value;
      if (!ensuredDecks.has(deck)) {
        await this.ankiGateway.ensureDeckExists(deck);
        ensuredDecks.add(deck);
      }

      const renderedItems = resolvedItems.map((item) => ({
        ...item,
        title: renderQaGroupInlineMarkdown(item.title, false),
        answer: renderQaGroupInlineMarkdown(
          preprocessCardBodyMarkdown(item.answer, settings.keepPureTagLinesInCardBody),
          true,
        ),
      }));
      const fields = buildQaGroupNoteFields(
        mapping,
        renderQaGroupInlineMarkdown(block.stem, false),
        renderedItems,
        this.buildGroupBacklinkAnchor(block, settings) || backlinkAnchor,
        settings.obsidianBacklinkPlacement,
        legacyInternalFields,
      );
      let noteId = recovered.noteId ?? block.noteId;
      let loadedNote = recovered.loadedNote;

      if (noteId === undefined) {
        noteId = await this.ankiGateway.addNote({
          deckName: deck,
          modelName,
          fields,
          tags: block.tagsHint ?? [],
        });
        created += 1;
        touchedSyncKeys.add(block.syncKey);
      } else {
        loadedNote ??= await this.tryLoadQaGroupNote(noteId, block, modelName);
        if (loadedNote.kind === "missing") {
          noteId = await this.ankiGateway.addNote({
            deckName: deck,
            modelName,
            fields,
            tags: block.tagsHint ?? [],
          });
          created += 1;
          touchedSyncKeys.add(block.syncKey);
        }

        if (loadedNote.kind === "matching") {
          const existingNote = loadedNote.note;
          const fieldsChanged = !haveEqualFields(existingNote.fields, fields);
          const deckChanged = !(existingNote.deckNames ?? []).includes(deck);
          const tagDiff = diffTagSets(block.tagsHint, existingNote.tags);
          const tagsChanged = tagDiff.addTags.length > 0 || tagDiff.removeTags.length > 0;

          if (!fieldsChanged && !deckChanged && !tagsChanged) {
            resolvedNoteIds.set(block.syncKey, noteId);
            const now = this.now();
            syncedGroupBlocks.push({
              groupId,
              noteId,
              filePath: block.filePath,
              headingText: block.headingText,
              backlinkHeadingText: block.backlinkHeadingText,
              headingLevel: block.headingLevel,
              stem: block.stem,
              src: block.src || buildGroupSrc(block.filePath, block.backlinkHeadingText),
              blockStartOffset: block.blockStartOffset,
              blockEndOffset: block.blockEndOffset,
              blockStartLine: block.blockStartLine,
              bodyStartLine: block.bodyStartLine,
              blockEndLine: block.blockEndLine,
              contentEndLine: block.contentEndLine,
              markerLine: block.markerLine,
              markerIndent: block.markerIndent,
              rawBlockText: block.rawBlockText,
              rawBlockHash: block.rawBlockHash,
              deck,
              deckHint: block.deckHint,
              deckHintSource: block.deckHintSource,
              deckWarnings: [...deckResolution.warnings],
              tagsHint: block.tagsHint ? [...block.tagsHint] : [],
              items: resolvedItems,
              freeSlots,
              lastSyncedAt: recovered.stateRecord?.lastSyncedAt ?? now,
              orphan: false,
            });
            continue;
          }

          if (fieldsChanged || deckChanged) {
            await this.ankiGateway.updateNote({
              noteId,
              fields,
              deckName: deckChanged ? deck : undefined,
            });
          }
          if (fieldsChanged) {
            updated += 1;
          }
          if (!fieldsChanged && tagsChanged) {
            updated += 1;
          }
          if (deckChanged) {
            migratedDecks += 1;
          }
          if (tagsChanged) {
            await this.ankiGateway.syncNoteTags([{
              noteId,
              addTags: tagDiff.addTags,
              removeTags: tagDiff.removeTags,
            }]);
          }
          touchedSyncKeys.add(block.syncKey);
        }

        if (loadedNote.kind === "model-mismatch") {
          const deckChanged = !(loadedNote.note.deckNames ?? []).includes(deck);
          const tagDiff = diffTagSets(block.tagsHint, loadedNote.note.tags);
          const tagsChanged = tagDiff.addTags.length > 0 || tagDiff.removeTags.length > 0;

          try {
            await this.ankiGateway.updateNoteModel({
              noteId,
              modelName,
              fields,
            });
          } catch (error) {
            throw createNoteTypeMigrationError({
              noteId,
              fromModel: loadedNote.actualModelName,
              toModel: loadedNote.expectedModelName,
              error,
              location: `${block.filePath}:${block.blockStartLine}`,
            });
          }

          if (deckChanged && loadedNote.note.cardIds.length > 0) {
            await this.ankiGateway.changeDecks([{
              deckName: deck,
              cardIds: loadedNote.note.cardIds,
            }]);
            migratedDecks += 1;
          }

          if (tagsChanged) {
            await this.ankiGateway.syncNoteTags([{
              noteId,
              addTags: tagDiff.addTags,
              removeTags: tagDiff.removeTags,
            }]);
          }

          updated += 1;
          migratedNoteTypes += 1;
          touchedSyncKeys.add(block.syncKey);
        }
      }

      resolvedNoteIds.set(block.syncKey, noteId);

      const itemToSlot = Object.fromEntries(resolvedItems
        .filter((item) => item.itemId && item.slot)
        .map((item) => [item.itemId as string, item.slot as number]));
      if (
        block.markerState !== "present-valid"
        || !this.groupMarkerService.isEquivalent(block.groupMarker, noteId, itemToSlot, freeSlots)
        || hasLegacyInnerIdMarkers(block)
      ) {
        markerWrites.push({
          syncKey: block.syncKey,
          filePath: block.filePath,
          blockStartLine: block.blockStartLine,
          contentEndLine: block.contentEndLine,
          blockEndLine: block.blockEndLine,
          markerLine: block.markerLine,
          markerIndent: block.markerIndent,
          noteId,
          groupId,
          itemToSlot,
          freeSlots,
          sourceContent: block.sourceContent ?? "",
        });
      }

      const now = this.now();
      syncedGroupBlocks.push({
        groupId,
        noteId,
        filePath: block.filePath,
        headingText: block.headingText,
        backlinkHeadingText: block.backlinkHeadingText,
        headingLevel: block.headingLevel,
        stem: block.stem,
        src: block.src || buildGroupSrc(block.filePath, block.backlinkHeadingText),
        blockStartOffset: block.blockStartOffset,
        blockEndOffset: block.blockEndOffset,
        blockStartLine: block.blockStartLine,
        bodyStartLine: block.bodyStartLine,
        blockEndLine: block.blockEndLine,
        contentEndLine: block.contentEndLine,
        markerLine: block.markerLine,
        markerIndent: block.markerIndent,
        rawBlockText: block.rawBlockText,
        rawBlockHash: block.rawBlockHash,
        deck,
        deckHint: block.deckHint,
        deckHintSource: block.deckHintSource,
        deckWarnings: [...deckResolution.warnings],
        tagsHint: block.tagsHint ? [...block.tagsHint] : [],
        items: resolvedItems,
        freeSlots,
        lastSyncedAt: touchedSyncKeys.has(block.syncKey) ? now : recovered.stateRecord?.lastSyncedAt ?? now,
        orphan: false,
      });
    }

    return {
      created,
      updated,
      migratedNoteTypes,
      migratedDecks,
      markerWrites,
      resolvedNoteIds,
      touchedSyncKeys: [...touchedSyncKeys],
      syncedGroupBlocks,
      warnings: [...warningMap.values()],
    };
  }

  private async resolveRecoveredGroup(
    block: IndexedGroupCardBlock,
    stateIndex: GroupStateIndex,
    modelName: string,
    mapping: QaGroupFieldMapping,
    availableSlots: number[],
  ): Promise<RecoveredGroupRecord> {
    const stateRecord = (block.groupId ? stateIndex.byGroupId.get(block.groupId) : undefined)
      ?? (block.noteId !== undefined ? stateIndex.byNoteId.get(block.noteId) : undefined)
      ?? uniqueMatch(stateIndex.bySrc.get(block.src));

    if (stateRecord) {
      return {
        noteId: stateRecord.noteId,
        groupId: stateRecord.groupId,
        items: stateRecord.items.map((item) => ({ ...item })),
        freeSlots: [...stateRecord.freeSlots],
        stateRecord,
      };
    }

    if (block.noteId !== undefined) {
      const loadedNote = await this.tryLoadQaGroupNote(block.noteId, block, modelName);
      if (loadedNote.kind === "matching") {
        return {
          ...noteDetailsToRecoveredGroup(loadedNote.note, mapping, availableSlots, block.groupId),
          loadedNote,
        };
      }

      if (loadedNote.kind === "model-mismatch") {
        return {
          noteId: loadedNote.note.noteId,
          groupId: block.groupId,
          items: [],
          freeSlots: [...availableSlots],
          loadedNote,
        };
      }

      return {
        noteId: block.noteId,
        groupId: block.groupId,
        items: [],
        freeSlots: [...availableSlots],
        loadedNote,
      };
    }

    return {
      items: [],
      freeSlots: [...availableSlots],
    };
  }

  private async tryLoadQaGroupNote(noteId: number, _block: IndexedGroupCardBlock, modelName: string): Promise<LoadedQaGroupNote> {
    const note = (await this.ankiGateway.getNoteDetails([noteId]))[0];
    if (!note) {
      return { kind: "missing" };
    }

    if (note.modelName !== modelName) {
      return {
        kind: "model-mismatch",
        note,
        actualModelName: note.modelName,
        expectedModelName: modelName,
      };
    }

    return {
      kind: "matching",
      note,
    };
  }

  private buildGroupBacklinkAnchor(block: IndexedGroupCardBlock | null, settings: PluginSettings): string {
    if (!block || !settings.addObsidianBacklink || !this.createBacklink) {
      return "";
    }

    return renderObsidianBacklinkAnchor({
      href: this.createBacklink({
        filePath: block.filePath,
        sourceContent: block.sourceContent,
        headingLine: block.blockStartLine,
        blockStartLine: block.blockStartLine,
        bodyStartLine: block.bodyStartLine,
        blockEndLine: block.blockEndLine,
        contentEndLine: block.contentEndLine,
        markerLine: block.markerLine,
        headingLevel: block.headingLevel,
        headingText: block.backlinkHeadingText,
      }),
      label: settings.obsidianBacklinkLabel,
    });
  }

  private async resolveQaGroupModel(settings: PluginSettings): Promise<{
    modelName: string;
    mapping: QaGroupFieldMapping;
    availableSlots: number[];
    legacyInternalFields: string[];
  }> {
    const modelName = settings.cardTypeConfigs["qa-group"].noteType.trim();
    if (!modelName) {
      throw new PluginUserError("errors.noteFieldMapping.noteTypeNotSelected.qaGroup");
    }

    const storedMapping = settings.noteFieldMappings[createNoteFieldMappingKey("qa-group", modelName)];
    if (!isQaGroupFieldMapping(storedMapping)) {
      throw new PluginUserError("errors.noteFieldMapping.missingSavedMapping.qaGroup", {
        modelName,
      });
    }

    const fieldNames = await this.ankiGateway.getModelFieldNames(modelName);
    const mapping: QaGroupFieldMapping = {
      ...storedMapping,
      modelName,
      loadedFieldNames: [...fieldNames],
      slots: storedMapping.slots.map((slot) => ({ ...slot })),
      warnings: [...storedMapping.warnings],
      acceptedWarnings: storedMapping.acceptedWarnings ? [...storedMapping.acceptedWarnings] : undefined,
      loadedAt: this.now(),
    };
    this.qaGroupFieldMappingService.validateMapping(mapping, fieldNames);

    return {
      modelName,
      mapping,
      availableSlots: mapping.slots.map((slot) => slot.index),
      legacyInternalFields: collectLegacyManagedInternalFields(fieldNames),
    };
  }
}

function buildQaGroupNoteFields(
  mapping: QaGroupFieldMapping,
  stem: string,
  items: GroupItem[],
  backlinkAnchor: string,
  backlinkPlacement: PluginSettings["obsidianBacklinkPlacement"],
  legacyInternalFields: string[],
): Record<string, string> {
  if (!mapping.titleField) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupMissingTitle", {
      modelName: mapping.modelName,
    });
  }

  const titleFieldValue = backlinkAnchor && backlinkPlacement === "question-last-line"
    ? applyObsidianBacklinkPlacement({ title: stem, body: "" }, backlinkAnchor, backlinkPlacement).title
    : stem;

  const fields: Record<string, string> = {
    [mapping.titleField]: titleFieldValue,
  };

  for (const slot of mapping.slots) {
    fields[slot.questionField] = "";
    fields[slot.answerField] = "";
  }

  for (const fieldName of legacyInternalFields) {
    fields[fieldName] = "";
  }

  const slotByIndex = new Map(mapping.slots.map((slot) => [slot.index, slot]));
  for (const item of items) {
    if (item.slot === undefined) {
      continue;
    }

    const slot = slotByIndex.get(item.slot);
    if (!slot) {
      continue;
    }

    const answerValue = backlinkAnchor && backlinkPlacement !== "question-last-line"
      ? applyObsidianBacklinkPlacement({ title: item.title, body: item.answer }, backlinkAnchor, backlinkPlacement).body
      : item.answer;
    fields[slot.questionField] = item.title;
    fields[slot.answerField] = answerValue;
  }

  return fields;
}

function buildGroupStateIndex(groupBlocks: Record<string, GroupBlockState>): GroupStateIndex {
  const byGroupId = new Map<string, GroupBlockState>();
  const byNoteId = new Map<number, GroupBlockState>();
  const bySrc = new Map<string, GroupBlockState[]>();

  for (const groupBlock of Object.values(groupBlocks)) {
    if (groupBlock.orphan) {
      continue;
    }

    byGroupId.set(groupBlock.groupId, groupBlock);
    byNoteId.set(groupBlock.noteId, groupBlock);
    const entries = bySrc.get(groupBlock.src);
    if (entries) {
      entries.push(groupBlock);
      continue;
    }

    bySrc.set(groupBlock.src, [groupBlock]);
  }

  return {
    byGroupId,
    byNoteId,
    bySrc,
  };
}

function noteDetailsToRecoveredGroup(
  note: AnkiNoteDetails,
  mapping: QaGroupFieldMapping,
  availableSlots: number[],
  fallbackGroupId?: string,
): RecoveredGroupRecord {
  const items: GroupItem[] = [];
  const occupiedSlots = new Set<number>();

  for (const slot of mapping.slots) {
    const title = sanitizeRecoveredQaGroupField(note.fields[slot.questionField] ?? "");
    const answer = sanitizeRecoveredQaGroupField(note.fields[slot.answerField] ?? "");
    if (!title && !answer) {
      continue;
    }

    occupiedSlots.add(slot.index);
    items.push({
      itemId: `recovered-slot-${String(slot.index).padStart(2, "0")}`,
      title,
      answer,
      slot: slot.index,
      ordinalInMarkdown: slot.index,
    });
  }

  return {
    noteId: note.noteId,
    groupId: fallbackGroupId,
    items,
    freeSlots: availableSlots.filter((slot) => !occupiedSlots.has(slot)),
  };
}

function reconcileGroupItems(currentItems: GroupItem[], recoveredItems: GroupItem[], createItemId: () => string, availableSlots: number[]): GroupItem[] {
  const recoveredQueues = new Map<string, GroupItem[]>();
  const unmatchedRecovered: GroupItem[] = [];

  for (const item of recoveredItems) {
    const key = createItemContentKey(item.title, item.answer);
    const queue = recoveredQueues.get(key);
    if (queue) {
      queue.push(item);
    } else {
      recoveredQueues.set(key, [item]);
    }
    unmatchedRecovered.push(item);
  }

  const resolvedItems: GroupItem[] = [];
  const unmatchedCurrentIndexes: number[] = [];

  for (let index = 0; index < currentItems.length; index += 1) {
    const currentItem = currentItems[index];
    const queue = recoveredQueues.get(createItemContentKey(currentItem.title, currentItem.answer));
    const matchedRecovered = queue?.shift();
    if (!matchedRecovered) {
      unmatchedCurrentIndexes.push(index);
      continue;
    }

    removeRecoveredReference(unmatchedRecovered, matchedRecovered);
    resolvedItems[index] = {
      ...currentItem,
      itemId: matchedRecovered.itemId,
      slot: matchedRecovered.slot,
    };
  }

  const remainingRecovered = [...unmatchedRecovered].sort((left, right) => (left.ordinalInMarkdown - right.ordinalInMarkdown) || ((left.slot ?? 999) - (right.slot ?? 999)));
  for (const currentIndex of unmatchedCurrentIndexes) {
    const currentItem = currentItems[currentIndex];
    const recoveredItem = remainingRecovered.shift();
    if (recoveredItem) {
      resolvedItems[currentIndex] = {
        ...currentItem,
        itemId: recoveredItem.itemId,
        slot: recoveredItem.slot,
      };
      continue;
    }

    resolvedItems[currentIndex] = {
      ...currentItem,
      itemId: createItemId(),
    };
  }

  const occupiedSlots = new Set<number>(resolvedItems.map((item) => item.slot).filter((slot): slot is number => typeof slot === "number"));
  const freeSlots = [...availableSlots].filter((slot) => !occupiedSlots.has(slot));
  for (const item of resolvedItems) {
    if (item.slot !== undefined) {
      continue;
    }

    const nextSlot = freeSlots.shift();
    if (nextSlot === undefined) {
      throw new Error("No free QA Group slots are available.");
    }

    item.slot = nextSlot;
  }

  return resolvedItems.map((item, index) => ({
    ...item,
    ordinalInMarkdown: index + 1,
  }));
}

function buildFreeSlotsFromItems(items: GroupItem[], availableSlots: number[]): number[] {
  const occupiedSlots = new Set<number>(items.map((item) => item.slot).filter((slot): slot is number => typeof slot === "number"));
  return availableSlots.filter((slot) => !occupiedSlots.has(slot));
}

function createItemContentKey(title: string, answer: string): string {
  return `${title}\u0000${answer}`;
}

function removeRecoveredReference(items: GroupItem[], target: GroupItem): void {
  const index = items.findIndex((item) => item.itemId === target.itemId && item.slot === target.slot && item.title === target.title && item.answer === target.answer);
  if (index >= 0) {
    items.splice(index, 1);
  }
}

function uniqueMatch<T>(items: T[] | undefined): T | undefined {
  if (!items || items.length !== 1) {
    return undefined;
  }

  return items[0];
}

function haveEqualFields(left: Record<string, string>, right: Record<string, string>): boolean {
  const rightKeys = Object.keys(right).sort();
  for (const key of rightKeys) {
    if ((left[key] ?? "") !== (right[key] ?? "")) {
      return false;
    }
  }

  return true;
}

function hasLegacyInnerIdMarkers(block: IndexedGroupCardBlock): boolean {
  if (!block.sourceContent) {
    return false;
  }

  const lines = block.sourceContent.split(/\r?\n/);
  for (let lineIndex = block.blockStartLine; lineIndex < block.blockEndLine; lineIndex += 1) {
    if (/^\s*<!--\s*ID:/i.test(lines[lineIndex] ?? "")) {
      return true;
    }
  }

  return false;
}

function renderQaGroupInlineMarkdown(markdownText: string, renderTagChips: boolean): string {
  const protectedInline = protectInlineCode(markdownText);
  const transformed = protectedInline.text.replace(HIGHLIGHT_PATTERN, "<mark>$1</mark>");
  const restored = protectedInline.restore(transformed);
  const html = markdown.renderInline(restored).trim();

  return renderTagChips ? renderObsidianTagChipsInHtml(html) : html;
}

function normalizeRecoveredItemsForAvailableSlots(items: GroupItem[], availableSlots: number[]): GroupItem[] {
  const availableSlotSet = new Set(availableSlots);
  return items.map((item) => ({
    ...item,
    slot: typeof item.slot === "number" && availableSlotSet.has(item.slot) ? item.slot : undefined,
  }));
}

function sanitizeRecoveredQaGroupField(value: string): string {
  return value
    .replace(/<p><a class="anki-heading-sync-backlink"[^>]*>.*?<\/a><\/p>/g, "")
    .replace(/<br><a class="anki-heading-sync-backlink"[^>]*>.*?<\/a>/g, "")
    .trim();
}

function collectLegacyManagedInternalFields(fieldNames: string[]): string[] {
  const hasLegacyShape = fieldNames.includes("GroupId")
    && fieldNames.includes("Src")
    && fieldNames.some((fieldName) => /^S\d+_Id$/i.test(fieldName))
    && fieldNames.some((fieldName) => /^S\d+_Q$/i.test(fieldName))
    && fieldNames.some((fieldName) => /^S\d+_A$/i.test(fieldName));

  if (!hasLegacyShape) {
    return [];
  }

  return fieldNames.filter((fieldName) => fieldName === "GroupId" || fieldName === "Src" || /^S\d+_Id$/i.test(fieldName));
}

function protectInlineCode(text: string): { text: string; restore: (value: string) => string } {
  const matches: string[] = [];
  const nextText = text.replace(INLINE_CODE_PATTERN, (segment) => {
    const token = `@@QA_GROUP_INLINE_CODE_${matches.length}@@`;
    matches.push(segment);
    return token;
  });

  return {
    text: nextText,
    restore: (value: string) =>
      matches.reduce((current, segment, index) => current.split(`@@QA_GROUP_INLINE_CODE_${index}@@`).join(segment), value),
  };
}
