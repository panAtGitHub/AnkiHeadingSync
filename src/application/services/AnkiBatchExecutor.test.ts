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

  it("creates new notes with the indexed tag hint", async () => {
    const ankiGateway = new CountingAnkiGateway();
    const executor = new AnkiBatchExecutor(ankiGateway);
    const createCard = createPlannedCard("sync-tags");
    createCard.card.tagsHint = ["📖::一人公司", "3地区"];

    await executor.execute(
      {
        toCreate: [createCard],
        toUpdate: [],
        toVerifyDeck: [],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[createCard.card.syncKey, createRenderedSyncCard(createCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(ankiGateway.addedNotes[0]?.tags).toEqual(["📖::一人公司", "3地区"]);
  });

  it("syncs tag diffs for existing notes", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
      tags: ["old", "shared"],
    });

    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-update-tags", 300);
    updateCard.card.tagsHint = ["shared", "fresh"];

    await executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(ankiGateway.syncedNoteTags).toEqual([
      {
        noteId: 300,
        addTags: ["fresh"],
        removeTags: ["old"],
      },
    ]);
  });

  it("does not sync note tags when the current and target tag sets already match", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
      tags: ["shared", "fresh"],
    });

    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-update-tags", 300);
    updateCard.card.tagsHint = ["fresh", "shared"];

    await executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(ankiGateway.syncedNoteTags).toEqual([]);
  });

  it("migrates a basic note in place when the current note model changed", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.modelDetailsByName["New Basic"] = { fieldNames: ["Front", "Back"], isCloze: false };
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Old Basic",
      cardIds: [700],
      tags: ["old"],
    });
    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-migrate-basic", 300, "Obsidian", "New Basic", "basic");

    const result = await executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      {
        ...createModule3Settings().noteFieldMappings,
        "basic:New Basic": {
          cardType: "basic",
          modelName: "New Basic",
          loadedFieldNames: ["Front", "Back"],
          titleField: "Front",
          bodyField: "Back",
          loadedAt: 1,
        },
      },
    );

    expect(result.updated).toBe(1);
    expect(result.migratedNoteTypes).toBe(1);
    expect(ankiGateway.addedNotes).toEqual([]);
    expect(ankiGateway.updatedNotes).toEqual([]);
    expect(ankiGateway.updatedNoteModels).toEqual([
      {
        noteId: 300,
        modelName: "New Basic",
        fields: {
          Front: "Heading sync-migrate-basic",
          Back: "Body sync-migrate-basic",
        },
      },
    ]);
  });

  it("migrates a cloze note in place when the current note model changed", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.modelDetailsByName["New Cloze"] = { fieldNames: ["Text", "Extra"], isCloze: true };
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Old Cloze",
      cardIds: [700],
    });
    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-migrate-cloze", 300, "Obsidian", "New Cloze", "cloze");

    const result = await executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      {
        ...createModule3Settings().noteFieldMappings,
        "cloze:New Cloze": {
          cardType: "cloze",
          modelName: "New Cloze",
          loadedFieldNames: ["Text", "Extra"],
          mainField: "Text",
          loadedAt: 1,
        },
      },
    );

    expect(result.updated).toBe(1);
    expect(result.migratedNoteTypes).toBe(1);
    expect(ankiGateway.updatedNoteModels).toEqual([
      {
        noteId: 300,
        modelName: "New Cloze",
        fields: {
          Text: "Heading sync-migrate-cloze<br><br>Body sync-migrate-cloze",
        },
      },
    ]);
  });

  it("keeps the current updateNotes path when the existing and target note models already match", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Basic",
      cardIds: [700],
    });
    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-update-basic", 300);

    const result = await executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      createModule3Settings().noteFieldMappings,
    );

    expect(result.updated).toBe(1);
    expect(result.migratedNoteTypes).toBe(0);
    expect(ankiGateway.updatedNotes).toHaveLength(1);
    expect(ankiGateway.updatedNoteModels).toEqual([]);
  });

  it("surfaces the existing mapping error instead of migrating when the target mapping is incomplete", async () => {
    const ankiGateway = new CountingAnkiGateway();
    ankiGateway.modelDetailsByName["New Basic"] = { fieldNames: ["Front", "Back"], isCloze: false };
    ankiGateway.noteSummariesById.set(300, {
      noteId: 300,
      modelName: "Old Basic",
      cardIds: [700],
    });
    const executor = new AnkiBatchExecutor(ankiGateway);
    const updateCard = createPlannedCard("sync-migrate-error", 300, "Obsidian", "New Basic", "basic");

    await expect(executor.execute(
      {
        toCreate: [],
        toUpdate: [updateCard],
        toVerifyDeck: [updateCard],
        toChangeDeck: [],
        toRewriteMarker: [],
        toOrphan: [],
        unchangedCards: 0,
        warnings: [],
      },
      new Map([[updateCard.card.syncKey, createRenderedSyncCard(updateCard)]]),
      async (plannedCard) => createRenderedSyncCard(plannedCard),
      {
        ...createModule3Settings().noteFieldMappings,
        "basic:New Basic": {
          cardType: "basic",
          modelName: "New Basic",
          loadedFieldNames: ["Front", "Back"],
          titleField: "Front",
          loadedAt: 1,
        } as never,
      },
    )).rejects.toMatchObject({
      userMessage: {
        key: "errors.noteFieldMapping.incompleteSavedMapping.basic",
      },
    });

    expect(ankiGateway.updatedNoteModels).toEqual([]);
  });
});

function createPlannedCard(
  syncKey: string,
  noteId?: number,
  deck = "Obsidian",
  noteModel = "Basic",
  cardType: IndexedCard["cardType"] = "basic",
): PlannedCard {
  return {
    card: createIndexedCard(syncKey, noteId, cardType),
    noteId,
    deck,
    noteModel,
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

function createIndexedCard(syncKey: string, noteId?: number, cardType: IndexedCard["cardType"] = "basic"): IndexedCard {
  return {
    noteId,
    syncKey,
    idMarkerState: noteId ? "present-valid" : "missing",
    noteIdSource: noteId ? "marker" : undefined,
    filePath: "notes/example.md",
    cardType,
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