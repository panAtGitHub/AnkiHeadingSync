import { describe, expect, it } from "vitest";

import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { RenderedSyncCard } from "@/domain/manual-sync/entities/RenderedSyncCard";
import type { ManualSyncPlan, PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";
import { createModule3Settings, FakeManualSyncAnkiGateway } from "@/test-support/manualSyncFakes";

import { AnkiBatchExecutor } from "./AnkiBatchExecutor";

class CountingAnkiGateway extends FakeManualSyncAnkiGateway {
  public getModelDetailsCalls: string[] = [];

  override async getModelDetails(modelName: string): Promise<NoteModelDetails> {
    this.getModelDetailsCalls.push(modelName);
    return super.getModelDetails(modelName);
  }
}

describe("AnkiBatchExecutor", () => {
  it("caches note model details within a single execute run", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
    });

    const executor = new AnkiBatchExecutor(ankiGateway);
    const createOne = createPlannedCard("ahs_1");
    const createTwo = createPlannedCard("ahs_2");
    const updateOne = createPlannedCard("ahs_3", 300);
    const renderedCards = new Map<string, RenderedSyncCard>([
      [createOne.card.cardId, createRenderedSyncCard(createOne)],
      [createTwo.card.cardId, createRenderedSyncCard(createTwo)],
      [updateOne.card.cardId, createRenderedSyncCard(updateOne)],
    ]);
    const plan: ManualSyncPlan = {
      toCreate: [createOne, createTwo],
      toUpdate: [updateOne],
      toRewriteMarker: [],
      toOrphan: [],
      unchangedCards: 0,
      warnings: [],
    };

    const result = await executor.execute(
      plan,
      renderedCards,
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(result.created).toBe(2);
    expect(result.updated).toBe(1);
    expect(ankiGateway.getModelDetailsCalls).toEqual(["Basic"]);
  });

  it("ensures decks for adds and does not move existing notes to another deck on update", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
    });

    const executor = new AnkiBatchExecutor(ankiGateway);
    const createCard = createPlannedCard("ahs_create", undefined, "Folder::Deck");
    const updateCard = createPlannedCard("ahs_update", 300, "Changed::Deck");
    const renderedCards = new Map<string, RenderedSyncCard>([
      [createCard.card.cardId, createRenderedSyncCard(createCard)],
      [updateCard.card.cardId, createRenderedSyncCard(updateCard)],
    ]);

    await executor.execute(
      {
        toCreate: [createCard],
        toUpdate: [updateCard],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      renderedCards,
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(ankiGateway.ensuredDecks).toEqual([["Folder::Deck"]]);
    expect(ankiGateway.changedDecks).toEqual([]);
    expect(ankiGateway.addedNotes[0]?.deckName).toBe("Folder::Deck");
    expect(ankiGateway.updatedNotes[0]?.deckName).toBe("Changed::Deck");
  });
});

function createPlannedCard(cardId: string, noteId?: number, deck = "Obsidian"): PlannedCard {
  return {
    card: createIndexedCard(cardId, noteId),
    noteId,
    deck,
    noteModel: "Basic",
    renderConfigHash: "render-config",
  };
}

function createRenderedSyncCard(plannedCard: PlannedCard): RenderedSyncCard {
  return {
    card: plannedCard.card,
    noteId: plannedCard.noteId,
    deck: plannedCard.deck,
    noteModel: plannedCard.noteModel,
    renderConfigHash: plannedCard.renderConfigHash,
    renderedFields: {
      title: plannedCard.card.heading,
      body: plannedCard.card.bodyMarkdown,
    },
    media: [],
  };
}

function createIndexedCard(cardId: string, noteId?: number): IndexedCard {
  return {
    cardId,
    noteId,
    markerNoteId: noteId,
    filePath: "notes/example.md",
    cardType: "basic",
    heading: `Heading ${cardId}`,
    headingLevel: 4,
    bodyMarkdown: `Body ${cardId}`,
    blockStartOffset: 0,
    blockEndOffset: 10,
    blockStartLine: 1,
    bodyStartLine: 2,
    blockEndLine: 2,
    contentEndLine: 2,
    rawBlockText: `#### Heading ${cardId}\nBody ${cardId}`,
    rawBlockHash: `hash-${cardId}`,
    deckWarnings: [],
    tagsHint: [],
    markerState: noteId ? "card-and-note" : "card-only",
  };
}