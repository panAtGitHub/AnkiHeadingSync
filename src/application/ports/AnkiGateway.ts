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

export interface UpdateAnkiNoteModelInput {
  noteId: number;
  modelName: string;
  fields: Record<string, string>;
}

export interface SyncAnkiNoteTagsInput {
  noteId: number;
  addTags: string[];
  removeTags: string[];
}

export interface AnkiNoteSummary {
  noteId: number;
  modelName: string;
  cardIds: number[];
  deckNames?: string[];
  tags?: string[];
}

export interface ChangeDeckInput {
  deckName: string;
  cardIds: number[];
}

export interface DeckStat {
  deckName: string;
  noteCount?: number;
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
  updateNoteModel(input: UpdateAnkiNoteModelInput): Promise<void>;
  updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void>;
  syncNoteTags(inputs: SyncAnkiNoteTagsInput[]): Promise<void>;
  changeDecks(inputs: ChangeDeckInput[]): Promise<void>;
  deleteDecks(deckNames: string[]): Promise<void>;
  storeMedia(asset: MediaAsset): Promise<void>;
  storeMediaFiles(assets: MediaAsset[]): Promise<void>;
}

export interface AnkiGroupGateway extends AnkiGateway {
  getModelFieldNames(modelName: string): Promise<string[]>;
  getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>>;
  findNoteIds(query: string): Promise<number[]>;
  getNoteDetails(noteIds: number[]): Promise<AnkiNoteDetails[]>;
}