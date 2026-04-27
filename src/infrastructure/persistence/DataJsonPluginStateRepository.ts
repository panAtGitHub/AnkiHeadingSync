import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { normalizeStoredClozeMode, type ClozeMode } from "@/domain/manual-sync/entities/IndexedCard";
import { createEmptyPluginState, toNoteIdKey, type CardState, type FileState, type GroupBlockState, type PendingWriteBackState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

import type { PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

interface LegacyFileState extends Partial<FileState> {
  cardIds?: string[];
}

interface LegacyCardState extends Partial<CardState> {
  cardId?: string;
  noteId?: number;
}

interface LegacyPendingWriteBackState extends Partial<PendingWriteBackState> {
  cardId?: string;
  noteId?: number;
}

interface LegacyGroupBlockState extends Partial<GroupBlockState> {
  groupId?: string;
}

interface LegacyPluginState {
  files?: Record<string, LegacyFileState>;
  cards?: Record<string, LegacyCardState>;
  groupBlocks?: Record<string, LegacyGroupBlockState>;
  pendingWriteBack?: LegacyPendingWriteBackState[];
}

export class DataJsonPluginStateRepository implements PluginStateRepository {
  constructor(private readonly pluginDataStore: PluginDataStore<PluginDataSnapshot>) {}

  async load(): Promise<PluginState> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};
    return migratePluginState(snapshot.pluginState);
  }

  async save(state: PluginState): Promise<void> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};

    await this.pluginDataStore.save({
      ...snapshot,
      pluginState: state,
    });
  }
}

export function migratePluginState(pluginState?: PluginState | LegacyPluginState): PluginState {
  if (!pluginState) {
    return createEmptyPluginState();
  }

  const rawCards = pluginState.cards ?? {};
  const cards: Record<string, CardState> = {};

  for (const rawCard of Object.values(rawCards)) {
    const noteId = sanitizeNoteId(rawCard.noteId);
    if (noteId === undefined) {
      continue;
    }

    const nextCard = migrateCardState(rawCard, noteId);
    if (!nextCard) {
      continue;
    }

    const noteKey = toNoteIdKey(noteId);
    const existingCard = cards[noteKey];
    if (!existingCard || existingCard.lastSyncedAt <= nextCard.lastSyncedAt) {
      cards[noteKey] = nextCard;
    }
  }

  const files: Record<string, FileState> = {};
  for (const [filePath, rawFile] of Object.entries(pluginState.files ?? {})) {
    files[filePath] = {
      filePath,
      fileHash: typeof rawFile.fileHash === "string" ? rawFile.fileHash : "",
      fileStamp: typeof rawFile.fileStamp === "string" ? rawFile.fileStamp : "",
      deckRulesFingerprint: typeof rawFile.deckRulesFingerprint === "string" ? rawFile.deckRulesFingerprint : undefined,
      lastIndexedAt: typeof rawFile.lastIndexedAt === "number" ? rawFile.lastIndexedAt : 0,
      noteIds: collectMigratedFileNoteIds(rawFile, rawCards, cards),
      groupIds: collectMigratedFileGroupIds(rawFile, pluginState.groupBlocks ?? {}),
    };
  }

  const groupBlocks: Record<string, GroupBlockState> = {};
  for (const [groupId, rawGroupBlock] of Object.entries(pluginState.groupBlocks ?? {})) {
    const nextGroupBlock = migrateGroupBlockState(rawGroupBlock, groupId);
    if (!nextGroupBlock) {
      continue;
    }

    const existingGroupBlock = groupBlocks[groupId];
    if (!existingGroupBlock || existingGroupBlock.lastSyncedAt <= nextGroupBlock.lastSyncedAt) {
      groupBlocks[groupId] = nextGroupBlock;
    }
  }

  return {
    files,
    cards,
    groupBlocks,
    pendingWriteBack: migratePendingWriteBack(pluginState.pendingWriteBack),
  };
}

function migrateCardState(rawCard: LegacyCardState, noteId: number): CardState | null {
  const cardType = sanitizeCardType(rawCard.cardType);
  if (!cardType) {
    return null;
  }

  return {
    noteId,
    filePath: typeof rawCard.filePath === "string" ? rawCard.filePath : "",
    heading: typeof rawCard.heading === "string" ? rawCard.heading : "",
    backlinkHeadingText: typeof rawCard.backlinkHeadingText === "string"
      ? rawCard.backlinkHeadingText
      : (typeof rawCard.heading === "string" ? rawCard.heading : ""),
    headingLevel: typeof rawCard.headingLevel === "number" ? rawCard.headingLevel : 1,
    bodyMarkdown: typeof rawCard.bodyMarkdown === "string" ? rawCard.bodyMarkdown : "",
    cardType,
    clozeMode: normalizeStoredClozeMode(cardType, sanitizeClozeMode(rawCard.clozeMode)),
    blockStartOffset: typeof rawCard.blockStartOffset === "number" ? rawCard.blockStartOffset : 0,
    blockEndOffset: typeof rawCard.blockEndOffset === "number" ? rawCard.blockEndOffset : 0,
    blockStartLine: typeof rawCard.blockStartLine === "number" ? rawCard.blockStartLine : 1,
    bodyStartLine: typeof rawCard.bodyStartLine === "number" ? rawCard.bodyStartLine : 1,
    blockEndLine: typeof rawCard.blockEndLine === "number" ? rawCard.blockEndLine : 1,
    contentEndLine: typeof rawCard.contentEndLine === "number" ? rawCard.contentEndLine : 1,
    markerLine: typeof rawCard.markerLine === "number" ? rawCard.markerLine : undefined,
    rawBlockText: typeof rawCard.rawBlockText === "string" ? rawCard.rawBlockText : "",
    rawBlockHash: typeof rawCard.rawBlockHash === "string" ? rawCard.rawBlockHash : "",
    renderConfigHash: typeof rawCard.renderConfigHash === "string" ? rawCard.renderConfigHash : "",
    deck: typeof rawCard.deck === "string" ? rawCard.deck : "",
    deckHint: typeof rawCard.deckHint === "string" ? rawCard.deckHint : undefined,
    deckHintSource: rawCard.deckHintSource === "frontmatter" || rawCard.deckHintSource === "body" ? rawCard.deckHintSource : undefined,
    deckWarnings: Array.isArray(rawCard.deckWarnings) ? [...rawCard.deckWarnings] : [],
    tagsHint: Array.isArray(rawCard.tagsHint) ? rawCard.tagsHint.filter((tag): tag is string => typeof tag === "string") : [],
    lastSyncedAt: typeof rawCard.lastSyncedAt === "number" ? rawCard.lastSyncedAt : 0,
    orphan: Boolean(rawCard.orphan),
  };
}

function sanitizeCardType(value: unknown): CardState["cardType"] | undefined {
  if (value === "basic" || value === "cloze") {
    return value;
  }

  return undefined;
}

function sanitizeClozeMode(value: unknown): ClozeMode | undefined {
  if (value === "sequential" || value === "all") {
    return value;
  }

  return undefined;
}

function migrateGroupBlockState(rawGroupBlock: LegacyGroupBlockState, groupId: string): GroupBlockState | null {
  const noteId = sanitizeNoteId(rawGroupBlock.noteId);
  if (noteId === undefined || !groupId.trim()) {
    return null;
  }

  return {
    groupId,
    noteId,
    filePath: typeof rawGroupBlock.filePath === "string" ? rawGroupBlock.filePath : "",
    headingText: typeof rawGroupBlock.headingText === "string" ? rawGroupBlock.headingText : "",
    backlinkHeadingText: typeof rawGroupBlock.backlinkHeadingText === "string"
      ? rawGroupBlock.backlinkHeadingText
      : (typeof rawGroupBlock.headingText === "string" ? rawGroupBlock.headingText : ""),
    headingLevel: typeof rawGroupBlock.headingLevel === "number" ? rawGroupBlock.headingLevel : 1,
    stem: typeof rawGroupBlock.stem === "string" ? rawGroupBlock.stem : "",
    src: typeof rawGroupBlock.src === "string" ? rawGroupBlock.src : "",
    blockStartOffset: typeof rawGroupBlock.blockStartOffset === "number" ? rawGroupBlock.blockStartOffset : 0,
    blockEndOffset: typeof rawGroupBlock.blockEndOffset === "number" ? rawGroupBlock.blockEndOffset : 0,
    blockStartLine: typeof rawGroupBlock.blockStartLine === "number" ? rawGroupBlock.blockStartLine : 1,
    bodyStartLine: typeof rawGroupBlock.bodyStartLine === "number" ? rawGroupBlock.bodyStartLine : 1,
    blockEndLine: typeof rawGroupBlock.blockEndLine === "number" ? rawGroupBlock.blockEndLine : 1,
    contentEndLine: typeof rawGroupBlock.contentEndLine === "number" ? rawGroupBlock.contentEndLine : 1,
    markerLine: typeof rawGroupBlock.markerLine === "number" ? rawGroupBlock.markerLine : undefined,
    markerIndent: typeof rawGroupBlock.markerIndent === "string" ? rawGroupBlock.markerIndent : undefined,
    rawBlockText: typeof rawGroupBlock.rawBlockText === "string" ? rawGroupBlock.rawBlockText : "",
    rawBlockHash: typeof rawGroupBlock.rawBlockHash === "string" ? rawGroupBlock.rawBlockHash : "",
    deck: typeof rawGroupBlock.deck === "string" ? rawGroupBlock.deck : "",
    deckHint: typeof rawGroupBlock.deckHint === "string" ? rawGroupBlock.deckHint : undefined,
    deckHintSource: rawGroupBlock.deckHintSource === "frontmatter" || rawGroupBlock.deckHintSource === "body" ? rawGroupBlock.deckHintSource : undefined,
    deckWarnings: Array.isArray(rawGroupBlock.deckWarnings) ? [...rawGroupBlock.deckWarnings] : [],
    tagsHint: Array.isArray(rawGroupBlock.tagsHint) ? rawGroupBlock.tagsHint.filter((tag): tag is string => typeof tag === "string") : [],
    items: Array.isArray(rawGroupBlock.items)
      ? rawGroupBlock.items.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }

        const nextItem = item as GroupBlockState["items"][number];
        if (typeof nextItem.title !== "string" || typeof nextItem.answer !== "string" || typeof nextItem.ordinalInMarkdown !== "number") {
          return [];
        }

        return [{
          itemId: typeof nextItem.itemId === "string" ? nextItem.itemId : undefined,
          title: nextItem.title,
          answer: nextItem.answer,
          slot: typeof nextItem.slot === "number" ? nextItem.slot : undefined,
          ordinalInMarkdown: nextItem.ordinalInMarkdown,
        }];
      })
      : [],
    freeSlots: Array.isArray(rawGroupBlock.freeSlots)
      ? rawGroupBlock.freeSlots.filter((slot): slot is number => typeof slot === "number" && Number.isInteger(slot) && slot > 0)
      : [],
    lastSyncedAt: typeof rawGroupBlock.lastSyncedAt === "number" ? rawGroupBlock.lastSyncedAt : 0,
    orphan: Boolean(rawGroupBlock.orphan),
  };
}

function collectMigratedFileNoteIds(
  rawFile: LegacyFileState,
  rawCards: Record<string, LegacyCardState>,
  migratedCards: Record<string, CardState>,
): number[] {
  const noteIds = new Set<number>();

  if (Array.isArray(rawFile.noteIds)) {
    for (const noteId of rawFile.noteIds) {
      const sanitized = sanitizeNoteId(noteId);
      if (sanitized !== undefined && migratedCards[toNoteIdKey(sanitized)]) {
        noteIds.add(sanitized);
      }
    }
  }

  if (Array.isArray(rawFile.cardIds)) {
    for (const cardId of rawFile.cardIds) {
      const sanitized = sanitizeNoteId(rawCards[cardId]?.noteId);
      if (sanitized !== undefined && migratedCards[toNoteIdKey(sanitized)]) {
        noteIds.add(sanitized);
      }
    }
  }

  return Array.from(noteIds);
}

function migratePendingWriteBack(pendingWriteBack: LegacyPendingWriteBackState[] | undefined): PendingWriteBackState[] {
  if (!Array.isArray(pendingWriteBack)) {
    return [];
  }

  return pendingWriteBack.flatMap((rawPending) => {
    const nextPending = migratePendingWriteBackState(rawPending);
    return nextPending ? [nextPending] : [];
  });
}

function migratePendingWriteBackState(rawPending: LegacyPendingWriteBackState): PendingWriteBackState | null {
  const filePath = sanitizeNonEmptyString(rawPending.filePath);
  const blockStartLine = sanitizePositiveInteger(rawPending.blockStartLine);
  const expectedFileHash = sanitizeNonEmptyString(rawPending.expectedFileHash);
  const targetMarker = sanitizeNonEmptyString(rawPending.targetMarker);
  const rawBlockHash = sanitizeNonEmptyString(rawPending.rawBlockHash);
  const targetNoteId = sanitizeNoteId(rawPending.targetNoteId);

  if (!filePath || !blockStartLine || !expectedFileHash || !targetMarker || !rawBlockHash || !targetNoteId) {
    return null;
  }

  const markerKind = sanitizeMarkerKind(rawPending.markerKind);
  if (rawPending.markerKind !== undefined && !markerKind) {
    return null;
  }

  const targetGroupId = rawPending.targetGroupId === undefined
    ? undefined
    : sanitizeNonEmptyString(rawPending.targetGroupId);
  if (rawPending.targetGroupId !== undefined && !targetGroupId) {
    return null;
  }

  return {
    filePath,
    blockStartLine,
    expectedFileHash,
    targetMarker,
    rawBlockHash,
    targetNoteId,
    markerKind,
    targetGroupId,
  };
}

function collectMigratedFileGroupIds(
  rawFile: LegacyFileState,
  rawGroupBlocks: Record<string, LegacyGroupBlockState>,
): string[] {
  if (!Array.isArray(rawFile.groupIds)) {
    return [];
  }

  return rawFile.groupIds.filter((groupId): groupId is string => typeof groupId === "string" && Boolean(rawGroupBlocks[groupId]));
}

function sanitizeNoteId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function sanitizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function sanitizeMarkerKind(value: unknown): PendingWriteBackState["markerKind"] | undefined {
  return value === "card-id" || value === "group-gi" ? value : undefined;
}