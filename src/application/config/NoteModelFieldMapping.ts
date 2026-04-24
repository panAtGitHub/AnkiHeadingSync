import type { CardType } from "@/domain/card/entities/RenderedFields";

export type NoteModelFieldMappingCardType = CardType | "qa-group";

export interface NoteModelFieldMapping {
  cardType: NoteModelFieldMappingCardType;
  modelName: string;
  loadedFieldNames: string[];
  titleField?: string;
  bodyField?: string;
  mainField?: string;
  loadedAt: number;
}

export function createNoteFieldMappingKey(cardType: NoteModelFieldMappingCardType, modelName: string): string {
  return `${cardType}:${modelName}`;
}
