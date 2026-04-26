import type { CardType } from "@/domain/card/entities/RenderedFields";

export type NoteModelFieldMappingCardType = CardType | "qa-group";

interface BaseNoteModelFieldMapping {
  cardType: NoteModelFieldMappingCardType;
  modelName: string;
  loadedFieldNames: string[];
  loadedAt: number;
}

export interface BasicLikeNoteModelFieldMapping extends BaseNoteModelFieldMapping {
  cardType: Extract<NoteModelFieldMappingCardType, "basic" | "semantic-qa">;
  titleField?: string;
  bodyField?: string;
}

export interface ClozeNoteModelFieldMapping extends BaseNoteModelFieldMapping {
  cardType: "cloze";
  mainField?: string;
}

export interface QaGroupSlotMapping {
  index: number;
  questionField: string;
  answerField: string;
}

export interface QaGroupFieldDerivation {
  mode: "first-pair";
  firstQuestionField?: string;
  firstAnswerField?: string;
}

export interface QaGroupFieldMapping extends BaseNoteModelFieldMapping {
  cardType: "qa-group";
  titleField?: string;
  slots: QaGroupSlotMapping[];
  warnings: string[];
  acceptedWarnings?: string[];
  derivation?: QaGroupFieldDerivation;
}

export type NoteModelFieldMapping = BasicLikeNoteModelFieldMapping | ClozeNoteModelFieldMapping | QaGroupFieldMapping;

export function createNoteFieldMappingKey(cardType: NoteModelFieldMappingCardType, modelName: string): string {
  return `${cardType}:${modelName}`;
}

export function isBasicLikeNoteModelFieldMapping(mapping: NoteModelFieldMapping | undefined): mapping is BasicLikeNoteModelFieldMapping {
  return mapping?.cardType === "basic" || mapping?.cardType === "semantic-qa";
}

export function isClozeNoteModelFieldMapping(mapping: NoteModelFieldMapping | undefined): mapping is ClozeNoteModelFieldMapping {
  return mapping?.cardType === "cloze";
}

export function isQaGroupFieldMapping(mapping: NoteModelFieldMapping | undefined): mapping is QaGroupFieldMapping {
  return mapping?.cardType === "qa-group";
}
