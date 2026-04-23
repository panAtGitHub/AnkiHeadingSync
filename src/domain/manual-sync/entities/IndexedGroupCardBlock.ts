import type { DeckResolutionWarning, DeckResolutionSource } from "@/domain/manual-sync/value-objects/DeckResolution";

export type GroupMarkerState = "missing" | "present-valid" | "present-invalid";
export type GroupIdentitySource = "gi-marker" | "state-recovery" | "anki-recovery";

export interface GroupMarker {
  noteId?: number;
  itemToSlot: Record<string, number>;
  freeSlots: number[];
}

export interface GroupItem {
  itemId?: string;
  title: string;
  answer: string;
  slot?: number;
  ordinalInMarkdown: number;
}

export interface IndexedGroupCardBlock {
  noteId?: number;
  groupId?: string;
  syncKey: string;
  markerState: GroupMarkerState;
  identitySource?: GroupIdentitySource;
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
  deckHint?: string;
  deckHintSource?: Extract<DeckResolutionSource, "frontmatter" | "body">;
  deckWarnings: DeckResolutionWarning[];
  tagsHint?: string[];
  items: GroupItem[];
  groupMarker?: GroupMarker;
  freeSlots: number[];
  sourceContent?: string;
}

export function createIndexedGroupSyncKey(filePath: string, blockStartLine: number, rawBlockHash: string): string {
  return `${filePath}\u0000group\u0000${blockStartLine}\u0000${rawBlockHash}`;
}

export function buildGroupSrc(filePath: string, headingText: string): string {
  return `${filePath}#${headingText}`;
}