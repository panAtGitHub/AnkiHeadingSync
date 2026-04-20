import type { MediaAsset } from "@/domain/card/entities/RenderedFields";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";

export interface AddAnkiNoteInput {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
}

export interface UpdateAnkiNoteInput {
  noteId: number;
  deckName?: string;
  fields: Record<string, string>;
}

export interface AnkiNoteSummary {
  noteId: number;
  modelName: string;
  cardIds: number[];
  deckNames?: string[];
}

export interface ChangeDeckInput {
  deckName: string;
  cardIds: number[];
}

export interface DeckStat {
  deckName: string;
  noteCount?: number;
}

export interface AnkiModelTemplate {
  name: string;
  front: string;
  back: string;
}

export interface CreateAnkiModelInput {
  modelName: string;
  fieldNames: string[];
  templates: AnkiModelTemplate[];
  css: string;
  isCloze?: boolean;
}

export interface AnkiNoteDetails extends AnkiNoteSummary {
  fields: Record<string, string>;
}

export interface AnkiGateway {
  ensureDeckExists(deckName: string): Promise<void>;
  ensureDecks(deckNames: string[]): Promise<void>;
  listNoteModels(): Promise<string[]>;
  listDeckNames(): Promise<string[]>;
  getModelDetails(modelName: string): Promise<NoteModelDetails>;
  getDeckStats(deckNames: string[]): Promise<DeckStat[]>;
  getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]>;
  addNote(input: AddAnkiNoteInput): Promise<number>;
  addNotes(inputs: AddAnkiNoteInput[]): Promise<number[]>;
  deleteNotes(noteIds: number[]): Promise<void>;
  updateNote(input: UpdateAnkiNoteInput): Promise<void>;
  updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void>;
  changeDecks(inputs: ChangeDeckInput[]): Promise<void>;
  deleteDecks(deckNames: string[]): Promise<void>;
  storeMedia(asset: MediaAsset): Promise<void>;
  storeMediaFiles(assets: MediaAsset[]): Promise<void>;
}

export interface AnkiGroupGateway extends AnkiGateway {
  getModelFieldNames(modelName: string): Promise<string[]>;
  getModelTemplates(modelName: string): Promise<Record<string, AnkiModelTemplate>>;
  getModelStyling(modelName: string): Promise<string>;
  createModel(input: CreateAnkiModelInput): Promise<void>;
  addModelField(modelName: string, fieldName: string): Promise<void>;
  addModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void>;
  updateModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void>;
  updateModelStyling(modelName: string, css: string): Promise<void>;
  findNoteIds(query: string): Promise<number[]>;
  getNoteDetails(noteIds: number[]): Promise<AnkiNoteDetails[]>;
}