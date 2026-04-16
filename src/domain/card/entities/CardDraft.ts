import type { CardType } from "./RenderedFields";
import type { DeckName } from "../value-objects/DeckName";
import type { SourceLocation } from "../value-objects/SourceLocation";

export interface CardDraft {
  source: SourceLocation;
  heading: string;
  headingLevel: number;
  type: CardType;
  bodyMarkdown: string;
  deckHint?: DeckName;
}