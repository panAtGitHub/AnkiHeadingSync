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
  deckName: string;
  fields: Record<string, string>;
}

export interface AnkiNoteSummary {
  noteId: number;
  modelName: string;
  cardIds: number[];
}

export interface ChangeDeckInput {
  deckName: string;
  cardIds: number[];
}

export interface AnkiGateway {
  ensureDeckExists(deckName: string): Promise<void>;
  ensureDecks(deckNames: string[]): Promise<void>;
  listNoteModels(): Promise<string[]>;
  getModelDetails(modelName: string): Promise<NoteModelDetails>;
  getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]>;
  addNote(input: AddAnkiNoteInput): Promise<number>;
  addNotes(inputs: AddAnkiNoteInput[]): Promise<number[]>;
  updateNote(input: UpdateAnkiNoteInput): Promise<void>;
  updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void>;
  changeDecks(inputs: ChangeDeckInput[]): Promise<void>;
  storeMedia(asset: MediaAsset): Promise<void>;
  storeMediaFiles(assets: MediaAsset[]): Promise<void>;
}