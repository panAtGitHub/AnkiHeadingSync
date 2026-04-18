import type { CardType } from "@/domain/card/entities/RenderedFields";
import type { MarkerState } from "@/domain/manual-sync/entities/AhsMarker";

export interface IndexedCard {
  cardId: string;
  noteId?: number;
  markerNoteId?: number;
  filePath: string;
  cardType: CardType;
  heading: string;
  headingLevel: number;
  bodyMarkdown: string;
  blockStartOffset: number;
  blockEndOffset: number;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  contentEndLine: number;
  markerLine?: number;
  rawBlockText: string;
  rawBlockHash: string;
  deckHint?: string;
  tagsHint: string[];
  markerState: MarkerState;
  sourceContent?: string;
}