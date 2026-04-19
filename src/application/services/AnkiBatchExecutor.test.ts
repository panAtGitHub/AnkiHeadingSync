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
    const createOne = createPlannedCard("sync-1");
    const createTwo = createPlannedCard("sync-2");
    const updateOne = createPlannedCard("sync-3", 300);
    const renderedCards = new Map<string, RenderedSyncCard>([
      [createOne.card.syncKey, createRenderedSyncCard(createOne)],
      [createTwo.card.syncKey, createRenderedSyncCard(createTwo)],
      [updateOne.card.syncKey, createRenderedSyncCard(updateOne)],
    ]);
    const plan: ManualSyncPlan = {
      toCreate: [createOne, createTwo],
      toUpdate: [updateOne],
      toVerifyDeck: [updateOne],
      toChangeDeck: [],
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

  it("ensures target decks and executes changeDecks separately from field updates", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
    });

    const executor = new AnkiBatchExecutor(ankiGateway);
    const createCard = createPlannedCard("sync-create", undefined, "Folder::Deck");
    const updateCard = createPlannedCard("sync-update", 300, "Changed::Deck");
    const changeDeckCard = createPlannedCard("sync-migrate", 300, "Changed::Deck");
    const renderedCards = new Map<string, RenderedSyncCard>([
      [createCard.card.syncKey, createRenderedSyncCard(createCard)],
      [updateCard.card.syncKey, createRenderedSyncCard(updateCard)],
      [changeDeckCard.card.syncKey, createRenderedSyncCard(changeDeckCard)],
    ]);

    const result = await executor.execute(
      {
        toCreate: [createCard],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard, changeDeckCard],
        toChangeDeck: [changeDeckCard],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      renderedCards,
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.ensuredDecks).toEqual([["Folder::Deck", "Changed::Deck"]]);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "Changed::Deck", cardIds: [700] }]);
    expect(ankiGateway.addedNotes[0]?.deckName).toBe("Folder::Deck");
    expect(ankiGateway.updatedNotes[0]?.deckName).toBeUndefined();
  });
});

function createPlannedCard(syncKey: string, noteId?: number, deck = "Obsidian"): PlannedCard {
  return {
    card: createIndexedCard(syncKey, noteId),
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

function createIndexedCard(syncKey: string, noteId?: number): IndexedCard {
  return {
    noteId,
    syncKey,
    idMarkerState: noteId ? "present-valid" : "missing",
    noteIdSource: noteId ? "marker" : undefined,
    filePath: "notes/example.md",
    cardType: "basic",
    heading: `Heading ${syncKey}`,
    backlinkHeadingText: `Heading ${syncKey}`,
    headingLevel: 4,
    bodyMarkdown: `Body ${syncKey}`,
    blockStartOffset: 0,
    blockEndOffset: 10,
    blockStartLine: 1,
    bodyStartLine: 2,
    blockEndLine: 2,
    contentEndLine: 2,
    rawBlockText: `#### Heading ${syncKey}\nBody ${syncKey}`,
    rawBlockHash: `hash-${syncKey}`,
    deckWarnings: [],
    tagsHint: [],
  };
}