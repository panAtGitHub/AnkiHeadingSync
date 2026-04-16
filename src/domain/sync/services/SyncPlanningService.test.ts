import { describe, expect, it } from "vitest";

import type { Card } from "../../card/entities/Card";
import { createCardKey } from "../../card/value-objects/CardKey";
import { createContentHash } from "../../card/value-objects/ContentHash";
import { createDeckName } from "../../card/value-objects/DeckName";
import { createNoteModelName } from "../../card/value-objects/NoteModelName";
import { SyncRegistry } from "../entities/SyncRegistry";
import type { SyncRecord } from "../entities/SyncRecord";
import { SyncPlanningService } from "./SyncPlanningService";

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    key: createCardKey("card-a"),
    source: {
      filePath: "notes/example.md",
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
      title: "Prompt",
      body: "Answer",
    },
    fields: {
      title: "Prompt",
      body: "Answer",
    },
    contentHash: createContentHash("hash-a"),
    media: [],
    ...overrides,
  };
}

function createRecord(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    cardKey: createCardKey("card-a"),
    noteId: 100,
    filePath: "notes/example.md",
    sourceHash: createContentHash("hash-a"),
    lastSyncedAt: 1,
    orphan: false,
    ...overrides,
  };
}

describe("SyncPlanningService", () => {
  it("plans adds, updates, and orphan marking", () => {
    const service = new SyncPlanningService();
    const changedCard = createCard({ contentHash: createContentHash("hash-b") });
    const newCard = createCard({
      key: createCardKey("card-b"),
      contentHash: createContentHash("hash-c"),
      source: {
        filePath: "notes/second.md",
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        headingLevel: 4,
        headingText: "Another",
      },
      heading: "Another",
    });
    const registry = new SyncRegistry([
      createRecord(),
      createRecord({
        cardKey: createCardKey("orphan-card"),
        noteId: 101,
        filePath: "notes/orphan.md",
        sourceHash: createContentHash("old"),
      }),
    ]);

    const plan = service.plan([changedCard, newCard], registry, ["notes/example.md", "notes/second.md", "notes/orphan.md"]);

    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toMarkOrphan).toHaveLength(1);
    expect(plan.toCreateDecks).toEqual([createDeckName("Deck")]);
  });

  it("rejects duplicate card keys in one scan", () => {
    const service = new SyncPlanningService();
    const card = createCard();

    expect(() => service.plan([card, card], new SyncRegistry(), ["notes/example.md"])).toThrow(
      "Duplicate card key detected in current scan",
    );
  });
});