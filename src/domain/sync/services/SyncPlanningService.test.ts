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
      sourceContent: ["#### Prompt", "Answer"].join("\n"),
      headingLine: 1,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 3,
      contentEndLine: 2,
      headingLevel: 4,
      headingText: "Prompt",
    },
    type: "basic",
    heading: "Prompt",
    bodyMarkdown: "Answer",
    embeddedNoteId: undefined,
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
    identityMode: "legacy-card-key",
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
        sourceContent: ["#### Another", "Answer"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
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

  it("prefers embedded note id over legacy card key and tolerates registry loss", () => {
    const service = new SyncPlanningService();
    const embeddedCard = createCard({
      key: createCardKey("moved-card-key"),
      embeddedNoteId: 222,
      source: {
        ...createCard().source,
        filePath: "notes/moved.md",
      },
    });

    const planWithoutRegistry = service.plan([embeddedCard], new SyncRegistry(), ["notes/moved.md"]);

    expect(planWithoutRegistry.toAdd).toHaveLength(0);
    expect(planWithoutRegistry.toUpdate).toEqual([{ card: embeddedCard, noteId: 222 }]);
  });

  it("marks embedded and legacy records orphan using different identity modes", () => {
    const service = new SyncPlanningService();
    const registry = new SyncRegistry([
      createRecord({
        cardKey: createCardKey("legacy-card"),
        noteId: 100,
        filePath: "notes/legacy.md",
      }),
      createRecord({
        cardKey: createCardKey("embedded-card"),
        identityMode: "embedded-note-id",
        noteId: 200,
        filePath: "notes/embedded.md",
      }),
    ]);

    const embeddedCard = createCard({
      key: createCardKey("different-card-key"),
      embeddedNoteId: 200,
      source: {
        ...createCard().source,
        filePath: "notes/embedded.md",
      },
    });

    const plan = service.plan([embeddedCard], registry, ["notes/legacy.md", "notes/embedded.md"]);

    expect(plan.toMarkOrphan.map((record) => record.noteId)).toEqual([100]);
  });

  it("forces pending note-id-write records back through update flow", () => {
    const service = new SyncPlanningService();
    const card = createCard();
    const registry = new SyncRegistry([
      createRecord({
        cardKey: card.key,
        identityMode: "pending-note-id-write",
        legacyCardKey: card.key,
      }),
    ]);

    const plan = service.plan([card], registry, ["notes/example.md"]);

    expect(plan.toUpdate).toEqual([{ card, noteId: 100 }]);
  });
});