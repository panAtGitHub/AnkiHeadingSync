import type { CardType } from "@/domain/card/entities/RenderedFields";
import type { GroupItem } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { DeckResolutionWarning, DeckResolutionSource } from "@/domain/manual-sync/value-objects/DeckResolution";

export interface FileState {
  filePath: string;
  fileHash: string;
  fileStamp: string;
  deckRulesFingerprint?: string;
  lastIndexedAt: number;
  noteIds: number[];
  groupIds?: string[];
}

export interface CardState {
  noteId: number;
  filePath: string;
  heading: string;
  backlinkHeadingText: string;
  headingLevel: number;
  bodyMarkdown: string;
  cardType: CardType;
  blockStartOffset: number;
  blockEndOffset: number;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  contentEndLine: number;
  markerLine?: number;
  rawBlockText: string;
  rawBlockHash: string;
  renderConfigHash: string;
  deck: string;
  deckHint?: string;
  deckHintSource?: Extract<DeckResolutionSource, "frontmatter" | "body">;
  deckWarnings: DeckResolutionWarning[];
  tagsHint: string[];
  lastSyncedAt: number;
  orphan: boolean;
}

export interface PendingWriteBackState {
  filePath: string;
  blockStartLine: number;
  expectedFileHash: string;
  targetMarker: string;
  rawBlockHash: string;
  targetNoteId: number;
  markerKind?: "card-id" | "group-gi";
  targetGroupId?: string;
}

export interface GroupBlockState {
  groupId: string;
  noteId: number;
  filePath: string;
  headingText: string;
  backlinkHeadingText: string;
  headingLevel: number;
  stem: string;
  src: string;
  blockStartOffset: number;
  blockEndOffset: number;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  contentEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  rawBlockText: string;
  rawBlockHash: string;
  deck: string;
  deckHint?: string;
  deckHintSource?: Extract<DeckResolutionSource, "frontmatter" | "body">;
  deckWarnings: DeckResolutionWarning[];
  tagsHint?: string[];
  items: GroupItem[];
  freeSlots: number[];
  lastSyncedAt: number;
  orphan: boolean;
}

export interface PluginState {
  files: Record<string, FileState>;
  cards: Record<string, CardState>;
  groupBlocks?: Record<string, GroupBlockState>;
  pendingWriteBack: PendingWriteBackState[];
}

export function createEmptyPluginState(): PluginState {
  return {
    files: {},
    cards: {},
    groupBlocks: {},
    pendingWriteBack: [],
  };
}

export function toNoteIdKey(noteId: number): string {
  return String(noteId);
}

export function createPendingWriteBackKey(filePath: string, blockStartLine: number, rawBlockHash: string): string {
  return `${filePath}\u0000${blockStartLine}\u0000${rawBlockHash}`;
}