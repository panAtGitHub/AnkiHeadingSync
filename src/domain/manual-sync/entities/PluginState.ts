import type { CardType } from "@/domain/card/entities/RenderedFields";

export interface FileState {
  filePath: string;
  fileHash: string;
  fileStamp: string;
  lastIndexedAt: number;
  cardIds: string[];
}

export interface CardState {
  cardId: string;
  noteId?: number;
  filePath: string;
  heading: string;
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
  tagsHint: string[];
  lastSyncedAt: number;
  orphan: boolean;
}

export interface PendingWriteBackState {
  filePath: string;
  cardId: string;
  noteId?: number;
  expectedFileHash: string;
  targetMarker: string;
  rawBlockHash: string;
}

export interface PluginState {
  files: Record<string, FileState>;
  cards: Record<string, CardState>;
  pendingWriteBack: PendingWriteBackState[];
}

export function createEmptyPluginState(): PluginState {
  return {
    files: {},
    cards: {},
    pendingWriteBack: [],
  };
}