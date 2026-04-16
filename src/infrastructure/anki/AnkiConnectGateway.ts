import { requestUrl } from "obsidian";

import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { AddAnkiNoteInput, AnkiGateway, UpdateAnkiNoteInput } from "@/application/ports/AnkiGateway";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";

interface AnkiResponse<T> {
  error: string | null;
  result: T;
}

interface NoteInfo {
  cards: number[];
}

type ModelTemplates = Record<string, unknown>;

export class AnkiConnectGateway implements AnkiGateway {
  constructor(private readonly getBaseUrl: () => string) {}

  async ensureDeckExists(deckName: string): Promise<void> {
    await this.invoke("createDeck", { deck: deckName });
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

  async storeMedia(asset: MediaAsset): Promise<void> {
    await this.invoke("storeMediaFile", {
      filename: asset.fileName,
      path: asset.absolutePath,
    });
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
}