import type { CardKey } from "../value-objects/CardKey";
import type { ContentHash } from "../value-objects/ContentHash";
import type { DeckName } from "../value-objects/DeckName";
import type { NoteModelName } from "../value-objects/NoteModelName";
import type { SourceLocation } from "../value-objects/SourceLocation";
import type { CardType, MediaAsset, RenderedFields } from "./RenderedFields";

export interface Card {
  key: CardKey;
  source: SourceLocation;
  type: CardType;
  heading: string;
  bodyMarkdown: string;
  deck: DeckName;
  noteModel: NoteModelName;
  tags: string[];
  renderedFields: RenderedFields;
  fields: Record<string, string>;
  contentHash: ContentHash;
  media: MediaAsset[];
}