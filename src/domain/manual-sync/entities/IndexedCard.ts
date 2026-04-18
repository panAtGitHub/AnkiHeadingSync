import type { CardType } from "@/domain/card/entities/RenderedFields";
import type { MarkerState } from "@/domain/manual-sync/entities/AhsMarker";
import type { DeckResolutionWarning, DeckResolutionSource } from "@/domain/manual-sync/value-objects/DeckResolution";

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
  deckHintSource?: Extract<DeckResolutionSource, "frontmatter" | "body">;
  deckWarnings: DeckResolutionWarning[];
  tagsHint: string[];
  markerState: MarkerState;
  sourceContent?: string;
}