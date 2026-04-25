import { requestUrl } from "obsidian";

import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { AddAnkiNoteInput, AnkiGroupGateway, AnkiModelTemplate, AnkiNoteDetails, AnkiNoteSummary, ChangeDeckInput, CreateAnkiModelInput, DeckStat, SyncAnkiNoteTagsInput, UpdateAnkiNoteInput, UpdateAnkiNoteModelInput } from "@/application/ports/AnkiGateway";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";

interface AnkiResponse<T> {
  error: string | null;
  result: T;
}

interface AnkiMultiActionResponse<T> {
  error: string | null;
  result: T;
}

interface NoteInfo {
  cards: number[];
  fields?: Record<string, { value?: string }>;
  modelName?: string;
  noteId?: number;
  tags?: string[];
}

interface CardInfo {
  cardId?: number;
  deckName?: string;
}

interface RawDeckStats {
  deck_id?: number;
  name?: string;
  total_in_deck?: number;
}

type ModelTemplates = Record<string, { Front?: string; Back?: string }>;

interface ModelStylingResponse {
  css?: string;
}

function buildModelUpdateParams(modelName: string, updates: Record<string, unknown>): Record<string, unknown> {
  return {
    model: {
      name: modelName,
      ...updates,
    },
  };
}

export class AnkiConnectGateway implements AnkiGroupGateway {
  constructor(private readonly getBaseUrl: () => string) {}

  async ensureDeckExists(deckName: string): Promise<void> {
    await this.invoke("createDeck", { deck: deckName });
  }

  async ensureDecks(deckNames: string[]): Promise<void> {
    const uniqueDeckNames = Array.from(new Set(deckNames));
    await this.invokeMulti<void>(uniqueDeckNames.map((deckName) => ({
      action: "createDeck",
      params: { deck: deckName },
    })));
  }

  async listNoteModels(): Promise<string[]> {
    return this.invoke<string[]>("modelNames", {});
  }

  async listDeckNames(): Promise<string[]> {
    const deckNamesAndIds = await this.invoke<Record<string, number>>("deckNamesAndIds", {});
    return Object.keys(deckNamesAndIds);
  }

  async getModelFieldNames(modelName: string): Promise<string[]> {
    return this.invoke<string[]>("modelFieldNames", { modelName });
  }

  async getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    const uniqueModelNames = Array.from(new Set(modelNames
      .map((modelName) => modelName.trim())
      .filter((modelName) => modelName.length > 0)));

    if (uniqueModelNames.length === 0) {
      return {};
    }

    const results = await this.invoke<Array<AnkiMultiActionResponse<string[]> | string[]>>("multi", {
      actions: uniqueModelNames.map((modelName) => ({
        action: "modelFieldNames",
        params: { modelName },
      })),
    });

    return uniqueModelNames.reduce<Record<string, string[]>>((fieldNamesByModelName, modelName, index) => {
      const fieldNames = extractMultiModelFieldNames(results[index]);
      if (fieldNames) {
        fieldNamesByModelName[modelName] = fieldNames;
      }

      return fieldNamesByModelName;
    }, {});
  }

  async getModelTemplates(modelName: string): Promise<Record<string, AnkiModelTemplate>> {
    const templates = await this.invoke<ModelTemplates>("modelTemplates", { modelName });
    return Object.fromEntries(Object.entries(templates).map(([templateName, template]) => [templateName, {
      name: templateName,
      front: template.Front ?? "",
      back: template.Back ?? "",
    }]));
  }

  async getModelStyling(modelName: string): Promise<string> {
    const styling = await this.invoke<ModelStylingResponse | string>("modelStyling", { modelName });
    if (typeof styling === "string") {
      return styling;
    }

    return styling.css ?? "";
  }

  async createModel(input: CreateAnkiModelInput): Promise<void> {
    await this.invoke("createModel", {
      modelName: input.modelName,
      inOrderFields: input.fieldNames,
      css: input.css,
      isCloze: Boolean(input.isCloze),
      cardTemplates: input.templates.map((template) => ({
        Name: template.name,
        Front: template.front,
        Back: template.back,
      })),
    });
  }

  async addModelField(modelName: string, fieldName: string): Promise<void> {
    await this.invoke("modelFieldAdd", {
      modelName,
      fieldName,
    });
  }

  async addModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void> {
    await this.invoke("modelTemplateAdd", {
      modelName,
      templateName: template.name,
      Front: template.front,
      Back: template.back,
    });
  }

  async updateModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void> {
    await this.invoke("updateModelTemplates", buildModelUpdateParams(modelName, {
      templates: {
        [template.name]: {
          Front: template.front,
          Back: template.back,
        },
      },
    }));
  }

  async updateModelStyling(modelName: string, css: string): Promise<void> {
    await this.invoke("updateModelStyling", buildModelUpdateParams(modelName, { css }));
  }

  async findNoteIds(query: string): Promise<number[]> {
    return this.invoke<number[]>("findNotes", { query });
  }

  async getNoteDetails(noteIds: number[]): Promise<AnkiNoteDetails[]> {
    if (noteIds.length === 0) {
      return [];
    }

    const noteInfo = await this.invoke<Array<NoteInfo | null>>("notesInfo", {
      notes: noteIds,
    });

    const allCardIds = noteInfo.flatMap((entry) => Array.isArray(entry?.cards) ? entry.cards : []);
    const cardDeckNamesByCardId = new Map<number, string>();

    if (allCardIds.length > 0) {
      const cardInfo = await this.invoke<Array<CardInfo | null>>("cardsInfo", {
        cards: allCardIds,
      });

      for (const entry of cardInfo) {
        if (!entry || typeof entry.cardId !== "number" || typeof entry.deckName !== "string") {
          continue;
        }

        cardDeckNamesByCardId.set(entry.cardId, entry.deckName);
      }
    }

    return noteInfo.flatMap((entry) => {
      if (!entry || typeof entry.noteId !== "number" || typeof entry.modelName !== "string") {
        return [];
      }

      const cardIds = Array.isArray(entry.cards) ? entry.cards : [];
      const fields = Object.fromEntries(Object.entries(entry.fields ?? {}).map(([fieldName, fieldValue]) => [fieldName, fieldValue?.value ?? ""]));

      return [{
        noteId: entry.noteId,
        modelName: entry.modelName,
        cardIds,
        deckNames: Array.from(new Set(cardIds
          .map((cardId) => cardDeckNamesByCardId.get(cardId))
          .filter((deckName): deckName is string => typeof deckName === "string"))),
        tags: Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === "string") : [],
        fields,
      }];
    });
  }

  async getModelDetails(modelName: string): Promise<NoteModelDetails> {
    const fieldNames = await this.getModelFieldNames(modelName);
    let isCloze = modelName.toLowerCase().includes("cloze");

    try {
      const templates = await this.getModelTemplates(modelName);
      isCloze = isCloze || Object.keys(templates).some((templateName) => templateName.toLowerCase().includes("cloze"));
    } catch {
      isCloze = isCloze || fieldNames.some((fieldName) => fieldName.toLowerCase() === "text");
    }

    return {
      fieldNames,
      isCloze,
    };
  }

  async getDeckStats(deckNames: string[]): Promise<DeckStat[]> {
    if (deckNames.length === 0) {
      return [];
    }

    const deckNamesAndIds = await this.invoke<Record<string, number>>("deckNamesAndIds", {});
    const rawStats = await this.invoke<unknown>("getDeckStats", {
      decks: deckNames,
    });

    return deckNames.map((deckName) => ({
      deckName,
      noteCount: extractDeckNoteCount(rawStats, deckNamesAndIds[deckName]),
    }));
  }

  async getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]> {
    return (await this.getNoteDetails(noteIds)).map((note) => ({
      noteId: note.noteId,
      modelName: note.modelName,
      cardIds: note.cardIds,
      deckNames: note.deckNames,
      tags: note.tags,
    }));
  }

  async addNote(input: AddAnkiNoteInput): Promise<number> {
    return this.invoke<number>("addNote", {
      note: {
        deckName: input.deckName,
        modelName: input.modelName,
        fields: input.fields,
        options: {
          allowDuplicate: false,
          duplicateScope: "deck",
        },
        tags: input.tags,
      },
    });
  }

  async addNotes(inputs: AddAnkiNoteInput[]): Promise<number[]> {
    return this.invokeMulti<number>(inputs.map((input) => ({
      action: "addNote",
      params: {
        note: {
          deckName: input.deckName,
          modelName: input.modelName,
          fields: input.fields,
          options: {
            allowDuplicate: false,
            duplicateScope: "deck",
          },
          tags: input.tags,
        },
      },
    })));
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    if (noteIds.length === 0) {
      return;
    }

    await this.invoke("deleteNotes", {
      notes: noteIds,
    });
  }

  async updateNote(input: UpdateAnkiNoteInput): Promise<void> {
    await this.invoke("updateNoteFields", {
      note: {
        id: input.noteId,
        fields: input.fields,
      },
    });

    if (!input.deckName) {
      return;
    }

    const noteInfo = await this.invoke<NoteInfo[]>("notesInfo", {
      notes: [input.noteId],
    });
    const cardIds = noteInfo[0]?.cards ?? [];

    if (cardIds.length > 0) {
      await this.invoke("changeDeck", {
        cards: cardIds,
        deck: input.deckName,
      });
    }
  }

  async updateNoteModel(input: UpdateAnkiNoteModelInput): Promise<void> {
    try {
      await this.invoke("updateNoteModel", {
        note: {
          id: input.noteId,
          modelName: input.modelName,
          fields: input.fields,
        },
      });
    } catch (error) {
      throw new Error(buildActionFailureMessage("updateNoteModel", {
        noteId: input.noteId,
        modelName: input.modelName,
      }, error));
    }
  }

  async updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void> {
    await this.invokeMulti<void>(inputs.map((input) => ({
      action: "updateNoteFields",
      params: {
        note: {
          id: input.noteId,
          fields: input.fields,
        },
      },
    })));
  }

  async syncNoteTags(inputs: SyncAnkiNoteTagsInput[]): Promise<void> {
    const actions: Array<{ action: string; params: Record<string, unknown> }> = [];

    for (const input of inputs) {
      if (input.removeTags.length > 0) {
        actions.push({
          action: "removeTags",
          params: {
            notes: [input.noteId],
            tags: input.removeTags.join(" "),
          },
        });
      }

      if (input.addTags.length > 0) {
        actions.push({
          action: "addTags",
          params: {
            notes: [input.noteId],
            tags: input.addTags.join(" "),
          },
        });
      }
    }

    await this.invokeMulti<void>(actions);
  }

  async changeDecks(inputs: ChangeDeckInput[]): Promise<void> {
    await this.invokeMulti<void>(inputs.filter((input) => input.cardIds.length > 0).map((input) => ({
      action: "changeDeck",
      params: {
        cards: input.cardIds,
        deck: input.deckName,
      },
    })));
  }

  async deleteDecks(deckNames: string[]): Promise<void> {
    const uniqueDeckNames = Array.from(new Set(deckNames));
    if (uniqueDeckNames.length === 0) {
      return;
    }

    await this.invoke("deleteDecks", {
      decks: uniqueDeckNames,
      cardsToo: true,
    });
  }

  async storeMedia(asset: MediaAsset): Promise<void> {
    await this.invoke("storeMediaFile", {
      filename: asset.fileName,
      path: asset.absolutePath,
    });
  }

  async storeMediaFiles(assets: MediaAsset[]): Promise<void> {
    await this.invokeMulti<void>(assets.map((asset) => ({
      action: "storeMediaFile",
      params: {
        filename: asset.fileName,
        path: asset.absolutePath,
      },
    })));
  }

  private async invoke<TResult>(action: string, params: Record<string, unknown>): Promise<TResult> {
    const response = await requestUrl({
      url: this.getBaseUrl(),
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        action,
        version: 6,
        params,
      }),
    });
    const parsed = response.json as AnkiResponse<TResult>;

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed.result;
  }

  private async invokeMulti<TResult>(actions: Array<{ action: string; params: Record<string, unknown> }>): Promise<TResult[]> {
    if (actions.length === 0) {
      return [];
    }

    return this.invoke<TResult[]>("multi", { actions });
  }
}

function extractMultiModelFieldNames(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((fieldName): fieldName is string => typeof fieldName === "string");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const multiActionResponse = value as Partial<AnkiMultiActionResponse<unknown>>;
  if (multiActionResponse.error) {
    return undefined;
  }

  if (!Array.isArray(multiActionResponse.result)) {
    return undefined;
  }

  return multiActionResponse.result.filter((fieldName): fieldName is string => typeof fieldName === "string");
}

function extractDeckNoteCount(rawStats: unknown, deckId: number | undefined): number | undefined {
  if (!rawStats || typeof rawStats !== "object") {
    return undefined;
  }

  if (typeof deckId !== "number") {
    return undefined;
  }

  const rawDeckStat = (rawStats as Record<string, unknown>)[String(deckId)];
  if (!rawDeckStat || typeof rawDeckStat !== "object") {
    return undefined;
  }

  const deckStat = rawDeckStat as RawDeckStats;
  const totalInDeck = deckStat.total_in_deck;
  if (typeof totalInDeck === "number" && Number.isFinite(totalInDeck)) {
    return totalInDeck;
  }

  return undefined;
}

function buildActionFailureMessage(
  action: string,
  context: { noteId?: number; modelName?: string },
  error: unknown,
): string {
  const scope = typeof context.noteId === "number" && typeof context.modelName === "string"
    ? ` for note ${context.noteId} to model ${context.modelName}`
    : typeof context.noteId === "number"
      ? ` for note ${context.noteId}`
      : "";

  return `AnkiConnect ${action} failed${scope}: ${extractRequestErrorMessage(error)}`;
}

function extractRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return String(error);
}
