import type { CardType } from "@/domain/card/entities/RenderedFields";
import type { IdMarkerState, NoteIdSource } from "@/domain/manual-sync/entities/IdMarker";
import type { DeckResolutionWarning, DeckResolutionSource } from "@/domain/manual-sync/value-objects/DeckResolution";

export type ClozeMode = "sequential" | "all";

export interface IndexedCard {
  noteId?: number;
  syncKey: string;
  idMarkerState: IdMarkerState;
  noteIdSource?: NoteIdSource;
  filePath: string;
  cardType: CardType;
  clozeMode?: ClozeMode;
  heading: string;
  backlinkHeadingText: string;
  headingLevel: number;
  bodyMarkdown: string;
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
  tagsHint: string[];
  sourceContent?: string;
}

export function createIndexedCardSyncKey(filePath: string, blockStartLine: number, rawBlockHash: string): string {
  return `${filePath}\u0000${blockStartLine}\u0000${rawBlockHash}`;
}