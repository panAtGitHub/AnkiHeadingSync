import type { PluginSettings } from "@/application/config/PluginSettings";
import type { AnkiGroupGateway, AnkiNoteDetails } from "@/application/ports/AnkiGateway";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";
import { buildGroupSrc, type GroupItem, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { GroupBlockState, PluginState } from "@/domain/manual-sync/entities/PluginState";
import { GroupMarkerService, type GroupMarkerWriteRequest } from "@/domain/manual-sync/services/GroupMarkerService";
import { DeckResolutionService } from "@/domain/manual-sync/services/DeckResolutionService";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { hashString } from "@/domain/shared/hash";

import { buildQaGroupNoteFields, formatQaGroupSlot, QA_GROUP_MODEL_NAME, QA_GROUP_SLOT_COUNT } from "./QaGroupModelDefinition";
import { QaGroupModelService } from "./QaGroupModelService";

export interface QaGroupSyncExecutionResult {
  created: number;
  updated: number;
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
  noteDetails?: AnkiNoteDetails;
  stateRecord?: GroupBlockState;
}

export class QaGroupSyncService {
  private sequence = 0;

  constructor(
    private readonly ankiGateway: AnkiGroupGateway,
    private readonly qaGroupModelService = new QaGroupModelService(ankiGateway),
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
        migratedDecks: 0,
        markerWrites: [],
        resolvedNoteIds: new Map(),
        touchedSyncKeys: [],
        syncedGroupBlocks: [],
        warnings: [],
      };
    }

    await this.qaGroupModelService.ensureModel();

    const stateIndex = buildGroupStateIndex(state.groupBlocks ?? {});
    const ensuredDecks = new Set<string>();
    const warningMap = new Map<string, DeckResolutionWarning>();
    const markerWrites: GroupMarkerWriteRequest[] = [];
    const resolvedNoteIds = new Map<string, number>();
    const touchedSyncKeys = new Set<string>();
    const syncedGroupBlocks: GroupBlockState[] = [];
    let created = 0;
    let updated = 0;
    let migratedDecks = 0;

    for (const block of blocks) {
      if (block.items.length > QA_GROUP_SLOT_COUNT) {
        throw new Error(`QA Group block exceeds 12 items at ${block.filePath}:${block.blockStartLine}.`);
      }

      const recovered = await this.resolveRecoveredGroup(block, stateIndex);
      const groupId = recovered.groupId ?? block.groupId ?? this.createGroupId();
      const resolvedItems = reconcileGroupItems(block.items, recovered.items, this.createItemId);
      if (resolvedItems.length > QA_GROUP_SLOT_COUNT) {
        throw new Error(`QA Group block exceeds 12 items after recovery at ${block.filePath}:${block.blockStartLine}.`);
      }

      const freeSlots = buildFreeSlotsFromItems(resolvedItems);
      const deckResolution = this.deckResolutionService.resolve({
        filePath: block.filePath,
        deckHint: block.deckHint,
        deckHintSource: block.deckHintSource,
        deckWarnings: block.deckWarnings,
      } as never, settings.defaultDeck, settings.folderDeckMode);
      for (const warning of deckResolution.warnings) {
        warningMap.set(`${warning.filePath}:${warning.code}:${warning.message}`, warning);
      }

      const deck = deckResolution.resolvedDeck.value;
      if (!ensuredDecks.has(deck)) {
        await this.ankiGateway.ensureDeckExists(deck);
        ensuredDecks.add(deck);
      }

      const fields = buildQaGroupNoteFields(block.stem, groupId, this.buildGroupBacklink(block, settings), resolvedItems);
      let noteId = recovered.noteId ?? block.noteId;
      let existingNote = recovered.noteDetails;

      if (noteId === undefined) {
        noteId = await this.ankiGateway.addNote({
          deckName: deck,
          modelName: QA_GROUP_MODEL_NAME,
          fields,
          tags: [],
        });
        created += 1;
        touchedSyncKeys.add(block.syncKey);
      } else {
        const stateUnchanged = recovered.stateRecord
          && recovered.stateRecord.rawBlockHash === block.rawBlockHash
          && recovered.stateRecord.deck === deck
          && !recovered.stateRecord.orphan;

        let fieldsChanged = !stateUnchanged;
        let deckChanged = recovered.stateRecord ? recovered.stateRecord.deck !== deck : false;

        if (!stateUnchanged) {
          existingNote ??= await this.tryLoadQaGroupNote(noteId, block);
          if (!existingNote) {
            noteId = await this.ankiGateway.addNote({
              deckName: deck,
              modelName: QA_GROUP_MODEL_NAME,
              fields,
              tags: [],
            });
            created += 1;
            touchedSyncKeys.add(block.syncKey);
          } else {
            fieldsChanged = !haveEqualFields(existingNote.fields, fields);
            deckChanged = !(existingNote.deckNames ?? []).includes(deck);
          }
        }

        if (existingNote && (fieldsChanged || deckChanged)) {
          await this.ankiGateway.updateNote({
            noteId,
            fields,
            deckName: deckChanged ? deck : undefined,
          });
          if (fieldsChanged) {
            updated += 1;
          }
          if (deckChanged) {
            migratedDecks += 1;
          }
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
        items: resolvedItems,
        freeSlots,
        lastSyncedAt: touchedSyncKeys.has(block.syncKey) ? now : recovered.stateRecord?.lastSyncedAt ?? now,
        orphan: false,
      });
    }

    return {
      created,
      updated,
      migratedDecks,
      markerWrites,
      resolvedNoteIds,
      touchedSyncKeys: [...touchedSyncKeys],
      syncedGroupBlocks,
      warnings: [...warningMap.values()],
    };
  }

  private async resolveRecoveredGroup(block: IndexedGroupCardBlock, stateIndex: GroupStateIndex): Promise<RecoveredGroupRecord> {
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

    if (block.groupId) {
      const recoveredByGroupId = await this.findSingleQaGroupNote(`note:${quoteAnkiValue(QA_GROUP_MODEL_NAME)} GroupId:${quoteAnkiValue(block.groupId)}`, block);
      if (recoveredByGroupId) {
        return noteDetailsToRecoveredGroup(recoveredByGroupId, block.groupId);
      }
    }

    if (block.noteId !== undefined) {
      const note = await this.tryLoadQaGroupNote(block.noteId, block);
      if (note) {
        return noteDetailsToRecoveredGroup(note, block.groupId);
      }
    }

    const recoveredBySrc = await this.findSingleQaGroupNote(`note:${quoteAnkiValue(QA_GROUP_MODEL_NAME)} Src:${quoteAnkiValue(block.src)}`, block);
    if (recoveredBySrc) {
      return noteDetailsToRecoveredGroup(recoveredBySrc, block.groupId);
    }

    return {
      items: [],
      freeSlots: Array.from({ length: QA_GROUP_SLOT_COUNT }, (_value, index) => index + 1),
    };
  }

  private async findSingleQaGroupNote(query: string, block: IndexedGroupCardBlock): Promise<AnkiNoteDetails | undefined> {
    const noteIds = await this.ankiGateway.findNoteIds(query);
    if (noteIds.length === 0) {
      return undefined;
    }

    if (noteIds.length > 1) {
      throw new Error(`QA Group recovery is ambiguous at ${block.filePath}:${block.blockStartLine}. Query: ${query}`);
    }

    return this.tryLoadQaGroupNote(noteIds[0], block);
  }

  private async tryLoadQaGroupNote(noteId: number, block: IndexedGroupCardBlock): Promise<AnkiNoteDetails | undefined> {
    const note = (await this.ankiGateway.getNoteDetails([noteId]))[0];
    if (!note) {
      return undefined;
    }

    if (note.modelName !== QA_GROUP_MODEL_NAME) {
      throw new Error(`Note ${noteId} for ${block.filePath}:${block.blockStartLine} is ${note.modelName}, expected ${QA_GROUP_MODEL_NAME}.`);
    }

    return note;
  }

  private buildGroupBacklink(block: IndexedGroupCardBlock, settings: PluginSettings): string {
    if (!settings.addObsidianBacklink || !this.createBacklink) {
      return "";
    }

    return this.createBacklink({
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
    });
  }
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

function noteDetailsToRecoveredGroup(note: AnkiNoteDetails, fallbackGroupId?: string): RecoveredGroupRecord {
  const items: GroupItem[] = [];
  const occupiedSlots = new Set<number>();

  for (let slot = 1; slot <= QA_GROUP_SLOT_COUNT; slot += 1) {
    const slotId = formatQaGroupSlot(slot);
    const itemId = (note.fields[`${slotId}_Id`] ?? "").trim() || `legacy_${slotId.toLowerCase()}`;
    const title = (note.fields[`${slotId}_Q`] ?? "").trim();
    const answer = (note.fields[`${slotId}_A`] ?? "").trim();
    if (!title && !answer && !(note.fields[`${slotId}_Id`] ?? "").trim()) {
      continue;
    }

    occupiedSlots.add(slot);
    items.push({
      itemId,
      title,
      answer,
      slot,
      ordinalInMarkdown: slot,
    });
  }

  return {
    noteId: note.noteId,
    groupId: (note.fields.GroupId ?? "").trim() || fallbackGroupId,
    items,
    freeSlots: Array.from({ length: QA_GROUP_SLOT_COUNT }, (_value, index) => index + 1).filter((slot) => !occupiedSlots.has(slot)),
    noteDetails: note,
  };
}

function reconcileGroupItems(currentItems: GroupItem[], recoveredItems: GroupItem[], createItemId: () => string): GroupItem[] {
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
  const freeSlots = Array.from({ length: QA_GROUP_SLOT_COUNT }, (_value, index) => index + 1).filter((slot) => !occupiedSlots.has(slot));
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

function buildFreeSlotsFromItems(items: GroupItem[]): number[] {
  const occupiedSlots = new Set<number>(items.map((item) => item.slot).filter((slot): slot is number => typeof slot === "number"));
  return Array.from({ length: QA_GROUP_SLOT_COUNT }, (_value, index) => index + 1).filter((slot) => !occupiedSlots.has(slot));
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
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false;
    }

    if ((left[leftKeys[index]] ?? "") !== (right[rightKeys[index]] ?? "")) {
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

function quoteAnkiValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
