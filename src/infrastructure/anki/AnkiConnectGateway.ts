import { requestUrl } from "obsidian";

import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { AddAnkiNoteInput, AnkiGateway, AnkiNoteSummary, ChangeDeckInput, DeckStat, UpdateAnkiNoteInput } from "@/application/ports/AnkiGateway";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";

interface AnkiResponse<T> {
  error: string | null;
  result: T;
}

interface NoteInfo {
  cards: number[];
  modelName?: string;
  noteId?: number;
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

type ModelTemplates = Record<string, unknown>;

export class AnkiConnectGateway implements AnkiGateway {
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

  async getModelDetails(modelName: string): Promise<NoteModelDetails> {
    const fieldNames = await this.invoke<string[]>("modelFieldNames", { modelName });
    let isCloze = modelName.toLowerCase().includes("cloze");

    try {
      const templates = await this.invoke<ModelTemplates>("modelTemplates", { modelName });
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

      return [{
        noteId: entry.noteId,
        modelName: entry.modelName,
        cardIds,
        deckNames: Array.from(new Set(cardIds
          .map((cardId) => cardDeckNamesByCardId.get(cardId))
          .filter((deckName): deckName is string => typeof deckName === "string"))),
      }];
    });
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