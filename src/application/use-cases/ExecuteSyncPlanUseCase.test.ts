import { describe, expect, it } from "vitest";

import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import type { Card } from "@/domain/card/entities/Card";
import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";
import { createDeckName } from "@/domain/card/value-objects/DeckName";
import { createNoteModelName } from "@/domain/card/value-objects/NoteModelName";
import { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";

import { ExecuteSyncPlanUseCase } from "./ExecuteSyncPlanUseCase";
import type { ScanAndPlanResult } from "./types";

class InMemorySyncRegistryRepository implements SyncRegistryRepository {
  public savedRegistry: SyncRegistry | null = null;

  constructor(private readonly registry = new SyncRegistry()) {}

  async load(): Promise<SyncRegistry> {
    return this.registry;
  }

  async save(registry: SyncRegistry): Promise<void> {
    this.savedRegistry = registry;
  }
}

class FakeAnkiGateway implements AnkiGateway {
  public ensuredDecks: string[] = [];
  public addedNotes: Array<{ deckName: string; modelName: string; fields: Record<string, string> }> = [];
  public updatedNotes: Array<{ noteId: number; deckName: string; fields: Record<string, string> }> = [];
  public storedMedia: string[] = [];

  async ensureDeckExists(deckName: string): Promise<void> {
    this.ensuredDecks.push(deckName);
  }

  async getModelDetails(modelName: string) {
    return modelName === "Cloze"
      ? { fieldNames: ["Text", "Extra"], isCloze: true }
      : { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async addNote(input: { deckName: string; modelName: string; fields: Record<string, string> }): Promise<number> {
    this.addedNotes.push(input);
    return 9001;
  }

  async updateNote(input: { noteId: number; deckName: string; fields: Record<string, string> }): Promise<void> {
    this.updatedNotes.push(input);
  }

  async storeMedia(asset: { fileName: string }): Promise<void> {
    this.storedMedia.push(asset.fileName);
  }
}

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    key: createCardKey("card-1"),
    source: {
      filePath: "notes/current.md",
      headingLine: 1,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 3,
      headingLevel: 4,
      headingText: "Prompt",
    },
    type: "basic",
    heading: "Prompt",
    bodyMarkdown: "Answer",
    deck: createDeckName("Deck"),
    noteModel: createNoteModelName("Basic"),
    tags: [],
    renderedFields: {
      kind: "basic",
      values: {
        front: "Prompt",
        back: "Answer",
      },
    },
    fields: {
      front: "Prompt",
      back: "Answer",
    },
    contentHash: createContentHash("hash-1"),
    media: [],
    ...overrides,
  };
}

describe("ExecuteSyncPlanUseCase", () => {
  it("marks orphan records locally without any delete path", async () => {
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository(
      new SyncRegistry([
        {
          cardKey: createCardKey("orphan-card"),
          noteId: 42,
          filePath: "notes/orphan.md",
          sourceHash: createContentHash("old-hash"),
          lastSyncedAt: 1,
          orphan: false,
        },
      ]),
    );

    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, undefined, () => 1234);
    const result: ScanAndPlanResult = {
      cards: [createCard()],
      registry: new SyncRegistry([
        {
          cardKey: createCardKey("orphan-card"),
          noteId: 42,
          filePath: "notes/orphan.md",
          sourceHash: createContentHash("old-hash"),
          lastSyncedAt: 1,
          orphan: false,
        },
      ]),
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [createCard()],
        toUpdate: [],
        toMarkOrphan: [
          {
            cardKey: createCardKey("orphan-card"),
            noteId: 42,
            filePath: "notes/orphan.md",
            sourceHash: createContentHash("old-hash"),
            lastSyncedAt: 1,
            orphan: false,
          },
        ],
      },
      scopedFilePaths: ["notes/current.md", "notes/orphan.md"],
    };

    const execution = await useCase.execute(result);

    expect(execution.created).toBe(1);
    expect(execution.markedOrphan).toBe(1);
    expect(ankiGateway.ensuredDecks).toEqual(["Deck"]);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(repository.savedRegistry?.get(createCardKey("orphan-card"))?.orphan).toBe(true);
    expect(repository.savedRegistry?.get(createCardKey("orphan-card"))?.noteId).toBe(42);
  });
});