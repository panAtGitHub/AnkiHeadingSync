import type { CardType } from "@/domain/card/entities/RenderedFields";

export interface NoteModelFieldMapping {
  cardType: CardType;
  modelName: string;
  loadedFieldNames: string[];
  titleField?: string;
  bodyField?: string;
  mainField?: string;
  loadedAt: number;
}

export function createNoteFieldMappingKey(cardType: CardType, modelName: string): string {
  return `${cardType}:${modelName}`;
}