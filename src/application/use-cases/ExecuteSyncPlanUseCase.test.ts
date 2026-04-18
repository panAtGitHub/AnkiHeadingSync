import { describe, expect, it } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import type { AnkiGateway, AnkiNoteSummary } from "@/application/ports/AnkiGateway";
import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import { MarkdownWriteConflictError, type VaultGateway } from "@/application/ports/VaultGateway";
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

class FakeVaultGateway implements VaultGateway {
  public readonly files = new Map<string, string>();
  public failReplace = false;
  public replaceError: Error | null = null;
  public replaceCalls: Array<{ path: string; expectedContent: string; nextContent: string }> = [];

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content);
    }
  }

  async listMarkdownFiles() {
    return Array.from(this.files.entries()).map(([path, content]) => ({
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      content,
    }));
  }

  async getMarkdownFile(path: string) {
    const content = this.files.get(path);
    if (content === undefined) {
      return null;
    }

    return {
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      content,
    };
  }

  async replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void> {
    this.replaceCalls.push({ path, expectedContent, nextContent });

    if (this.replaceError) {
      throw this.replaceError;
    }

    if (this.failReplace) {
      throw new MarkdownWriteConflictError(path);
    }

    const currentContent = this.files.get(path);
    if (currentContent !== expectedContent) {
      throw new MarkdownWriteConflictError(path);
    }

    this.files.set(path, nextContent);
  }

  resolveWikiLink(rawTarget: string) {
    return { url: `obsidian://open?vault=Vault&file=${rawTarget}`, displayText: rawTarget };
  }

  resolveEmbed() {
    return null;
  }

  createBacklink() {
    return "obsidian://open?vault=Vault&file=notes/current.md";
  }
}

class FakeAnkiGateway implements AnkiGateway {
  public ensuredDecks: string[] = [];
  public addedNotes: Array<{ deckName: string; modelName: string; fields: Record<string, string> }> = [];
  public updatedNotes: Array<{ noteId: number; deckName: string; fields: Record<string, string> }> = [];
  public storedMedia: string[] = [];
  public noteSummariesById = new Map<number, AnkiNoteSummary>();
  public modelDetailsByName: Record<string, { fieldNames: string[]; isCloze: boolean }> = {
    Basic: { fieldNames: ["Front", "Back"], isCloze: false },
    Cloze: { fieldNames: ["Text", "Extra"], isCloze: true },
  };
  private nextAddedNoteId = 9000;

  async ensureDeckExists(deckName: string): Promise<void> {
    this.ensuredDecks.push(deckName);
  }

  async listNoteModels(): Promise<string[]> {
    return Object.keys(this.modelDetailsByName);
  }

  async getModelDetails(modelName: string) {
    return this.modelDetailsByName[modelName] ?? { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]> {
    return noteIds.flatMap((noteId) => {
      const summary = this.noteSummariesById.get(noteId);
      return summary ? [summary] : [];
    });
  }

  async addNote(input: { deckName: string; modelName: string; fields: Record<string, string> }): Promise<number> {
    this.addedNotes.push(input);
    this.nextAddedNoteId += 1;
    return this.nextAddedNoteId;
  }

  async updateNote(input: { noteId: number; deckName: string; fields: Record<string, string> }): Promise<void> {
    this.updatedNotes.push(input);
  }

  async storeMedia(asset: { fileName: string }): Promise<void> {
    this.storedMedia.push(asset.fileName);
  }
}

function createCard(overrides: Partial<Card> = {}): Card {
  const sourceContent = (overrides.source?.sourceContent as string | undefined) ?? ["#### Prompt", "Answer"].join("\n");
  const lineCount = sourceContent.split(/\r?\n/).length;

  return {
    key: createCardKey("card-1"),
    source: {
      filePath: "notes/current.md",
      sourceContent,
      headingLine: 1,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: lineCount,
      contentEndLine: Math.min(lineCount, 2),
      headingLevel: 4,
      headingText: "Prompt",
      ...overrides.source,
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
    contentHash: createContentHash("hash-1"),
    media: [],
    ...overrides,
  };
}

function createMappings() {
  return {
    [createNoteFieldMappingKey("basic", "Basic")]: {
      cardType: "basic" as const,
      modelName: "Basic",
      loadedFieldNames: ["Front", "Back"],
      titleField: "Front",
      bodyField: "Back",
      loadedAt: 1,
    },
    [createNoteFieldMappingKey("cloze", "Cloze")]: {
      cardType: "cloze" as const,
      modelName: "Cloze",
      loadedFieldNames: ["Text", "Extra"],
      mainField: "Text",
      loadedAt: 1,
    },
  };
}

function createResult(overrides: Partial<ScanAndPlanResult> = {}): ScanAndPlanResult {
  return {
    cards: [],
    noteFieldMappings: createMappings(),
    registry: new SyncRegistry(),
    plan: {
      toCreateDecks: [createDeckName("Deck")],
      toAdd: [],
      toUpdate: [],
      toMarkOrphan: [],
    },
    scopedFilePaths: ["notes/current.md"],
    ...overrides,
  };
}

describe("ExecuteSyncPlanUseCase", () => {
  it("writes a new AHS marker to the end of the block for newly created cards", async () => {
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [card],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(vaultGateway.files.get("notes/current.md")).toBe(["#### Prompt", "Answer", "<!-- AHS:9001 -->"].join("\n"));
    expect(repository.savedRegistry?.findByNoteId(9001)).toMatchObject({
      identityMode: "embedded-note-id",
      noteId: 9001,
    });
  });

  it("writes empty-body markers on the line after the heading", async () => {
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": "#### Prompt",
    });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const templateCard = createCard();
    const card = createCard({
      bodyMarkdown: "",
      renderedFields: { title: "Prompt", body: "" },
      source: {
        ...templateCard.source,
        sourceContent: "#### Prompt",
        blockEndLine: 1,
        contentEndLine: 1,
      },
    });
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [card],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(vaultGateway.files.get("notes/current.md")).toBe(["#### Prompt", "<!-- AHS:9001 -->"].join("\n"));
  });

  it("stores pending-note-id-write when addNote succeeds but write-back fails", async () => {
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer changed elsewhere"].join("\n"),
    });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [card],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(repository.savedRegistry?.get(card.key)).toMatchObject({
      identityMode: "pending-note-id-write",
      legacyCardKey: card.key,
      noteId: 9001,
    });
  });

  it("writes multiple newly created cards in the same file with a single replace call", async () => {
    const sourceContent = ["###### 试验的卡片12", "卡片1", "", "###### 试验233", "卡片2"].join("\n");
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": sourceContent,
    });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const firstCard = createCard({
      key: createCardKey("card-1"),
      heading: "试验的卡片12",
      bodyMarkdown: "卡片1",
      renderedFields: { title: "试验的卡片12", body: "卡片1" },
      fields: { title: "试验的卡片12", body: "卡片1" },
      contentHash: createContentHash("hash-card-1"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 6,
        headingText: "试验的卡片12",
      },
    });
    const secondCard = createCard({
      key: createCardKey("card-2"),
      heading: "试验233",
      bodyMarkdown: "卡片2",
      renderedFields: { title: "试验233", body: "卡片2" },
      fields: { title: "试验233", body: "卡片2" },
      contentHash: createContentHash("hash-card-2"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 4,
        blockStartLine: 4,
        bodyStartLine: 5,
        blockEndLine: 5,
        contentEndLine: 5,
        headingLevel: 6,
        headingText: "试验233",
      },
    });
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [firstCard, secondCard],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [firstCard, secondCard],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.addedNotes).toHaveLength(2);
    expect(vaultGateway.replaceCalls).toHaveLength(1);
    expect(vaultGateway.files.get("notes/current.md")).toBe([
      "###### 试验的卡片12",
      "卡片1",
      "<!-- AHS:9001 -->",
      "",
      "###### 试验233",
      "卡片2",
      "<!-- AHS:9002 -->",
    ].join("\n"));
    expect(repository.savedRegistry?.findByNoteId(9001)).toMatchObject({ identityMode: "embedded-note-id" });
    expect(repository.savedRegistry?.findByNoteId(9002)).toMatchObject({ identityMode: "embedded-note-id" });
    expect(repository.savedRegistry?.list().some((record) => record.identityMode === "pending-note-id-write")).toBe(false);
  });

  it("marks all same-file writes pending when the batch replace fails", async () => {
    const sourceContent = ["###### 卡片1", "正文1", "", "###### 卡片2", "正文2"].join("\n");
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": sourceContent });
    vaultGateway.failReplace = true;
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const firstCard = createCard({
      key: createCardKey("batch-fail-1"),
      contentHash: createContentHash("hash-batch-fail-1"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 6,
        headingText: "卡片1",
      },
    });
    const secondCard = createCard({
      key: createCardKey("batch-fail-2"),
      contentHash: createContentHash("hash-batch-fail-2"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 4,
        blockStartLine: 4,
        bodyStartLine: 5,
        blockEndLine: 5,
        contentEndLine: 5,
        headingLevel: 6,
        headingText: "卡片2",
      },
    });
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [firstCard, secondCard],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [firstCard, secondCard],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.addedNotes).toHaveLength(2);
    expect(vaultGateway.files.get("notes/current.md")).toBe(sourceContent);
    expect(repository.savedRegistry?.get(firstCard.key)).toMatchObject({ identityMode: "pending-note-id-write", noteId: 9001 });
    expect(repository.savedRegistry?.get(secondCard.key)).toMatchObject({ identityMode: "pending-note-id-write", noteId: 9002 });
  });

  it("persists pending records before surfacing applyBatch validation failures", async () => {
    const sourceContent = ["###### 卡片1", "正文1"].join("\n");
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": sourceContent });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const firstCard = createCard({
      key: createCardKey("duplicate-block-1"),
      contentHash: createContentHash("hash-duplicate-1"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 2,
        contentEndLine: 2,
        headingLevel: 6,
        headingText: "卡片1",
      },
    });
    const secondCard = createCard({
      key: createCardKey("duplicate-block-2"),
      contentHash: createContentHash("hash-duplicate-2"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 2,
        contentEndLine: 2,
        headingLevel: 6,
        headingText: "卡片1",
      },
    });
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await expect(useCase.execute(createResult({
      cards: [firstCard, secondCard],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [firstCard, secondCard],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }))).rejects.toThrow("Duplicate marker write detected");

    expect(ankiGateway.addedNotes).toHaveLength(2);
    expect(vaultGateway.replaceCalls).toHaveLength(0);
    expect(repository.savedRegistry?.get(firstCard.key)).toMatchObject({ identityMode: "pending-note-id-write", noteId: 9001 });
    expect(repository.savedRegistry?.get(secondCard.key)).toMatchObject({ identityMode: "pending-note-id-write", noteId: 9002 });
  });

  it("persists pending records and surfaces unexpected file write errors", async () => {
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer"].join("\n"),
    });
    vaultGateway.replaceError = new Error("permission denied");
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await expect(useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [card],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }))).rejects.toThrow("permission denied");

    expect(repository.savedRegistry?.get(card.key)).toMatchObject({
      identityMode: "pending-note-id-write",
      noteId: 9001,
    });
  });

  it("flushes recreate-and-insert writes for the same file together", async () => {
    const sourceContent = ["###### 卡片1", "正文1", "<!-- AHS:42 -->", "", "###### 卡片2", "正文2"].join("\n");
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": sourceContent });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const recreatedCard = createCard({
      key: createCardKey("recreate-card"),
      embeddedNoteId: 42,
      contentHash: createContentHash("hash-recreate"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
        headingLevel: 6,
        headingText: "卡片1",
      },
    });
    const newCard = createCard({
      key: createCardKey("new-card"),
      contentHash: createContentHash("hash-new-card"),
      source: {
        filePath: "notes/current.md",
        sourceContent,
        headingLine: 5,
        blockStartLine: 5,
        bodyStartLine: 6,
        blockEndLine: 6,
        contentEndLine: 6,
        headingLevel: 6,
        headingText: "卡片2",
      },
    });
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [recreatedCard, newCard],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [newCard],
        toUpdate: [{ card: recreatedCard, noteId: 42 }],
        toMarkOrphan: [],
      },
    }));

    expect(vaultGateway.replaceCalls).toHaveLength(1);
    expect(vaultGateway.files.get("notes/current.md")).toBe([
      "###### 卡片1",
      "正文1",
      "<!-- AHS:9002 -->",
      "",
      "###### 卡片2",
      "正文2",
      "<!-- AHS:9001 -->",
    ].join("\n"));
  });

  it.each([
    {
      name: "heading change",
      card: createCard({
        key: createCardKey("card-heading-change"),
        heading: "Prompt changed",
        renderedFields: { title: "Prompt changed", body: "Answer" },
        contentHash: createContentHash("hash-heading"),
        embeddedNoteId: 42,
        source: {
          ...createCard().source,
          sourceContent: ["#### Prompt changed", "Answer", "<!-- AHS:42 -->"].join("\n"),
          headingText: "Prompt changed",
          blockEndLine: 3,
          contentEndLine: 2,
          markerLine: 3,
        },
      }),
    },
    {
      name: "body change",
      card: createCard({
        key: createCardKey("card-body-change"),
        bodyMarkdown: "Answer changed",
        renderedFields: { title: "Prompt", body: "Answer changed" },
        contentHash: createContentHash("hash-body"),
        embeddedNoteId: 42,
        source: {
          ...createCard().source,
          sourceContent: ["#### Prompt", "Answer changed", "<!-- AHS:42 -->"].join("\n"),
          blockEndLine: 3,
          contentEndLine: 2,
          markerLine: 3,
        },
      }),
    },
    {
      name: "file move",
      card: createCard({
        key: createCardKey("card-file-move"),
        contentHash: createContentHash("hash-move"),
        embeddedNoteId: 42,
        source: {
          ...createCard().source,
          filePath: "notes/moved.md",
          sourceContent: ["#### Prompt", "Answer", "<!-- AHS:42 -->"].join("\n"),
          blockEndLine: 3,
          contentEndLine: 2,
          markerLine: 3,
        },
      }),
    },
  ])("updates the original embedded note after $name", async ({ card }) => {
    const vaultGateway = new FakeVaultGateway({
      [card.source.filePath]: card.source.sourceContent ?? "",
    });
    const ankiGateway = new FakeAnkiGateway();
    ankiGateway.noteSummariesById.set(42, { noteId: 42, modelName: "Basic" });
    const existingRecord = {
      cardKey: createCardKey("legacy-embedded-key"),
      identityMode: "embedded-note-id" as const,
      noteId: 42,
      filePath: "notes/original.md",
      sourceHash: createContentHash("old-hash"),
      lastSyncedAt: 1,
      orphan: false,
    };
    const repository = new InMemorySyncRegistryRepository(new SyncRegistry([existingRecord]));
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      registry: new SyncRegistry([existingRecord]),
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [],
        toUpdate: [{ card, noteId: 42 }],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.updatedNotes).toHaveLength(1);
    expect(ankiGateway.updatedNotes[0]?.noteId).toBe(42);
    expect(repository.savedRegistry?.findByNoteId(42)).toMatchObject({
      cardKey: card.key,
      filePath: card.source.filePath,
      identityMode: "embedded-note-id",
    });
  });

  it("refreshes embedded-note-id cards after in-block movement without creating a new note", async () => {
    const templateCard = createCard();
    const card = createCard({
      key: createCardKey("card-moved-in-block"),
      embeddedNoteId: 42,
      source: {
        ...templateCard.source,
        blockStartLine: 10,
        sourceContent: ["#### Prompt", "Answer", "<!-- AHS:42 -->"].join("\n"),
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
      },
    });
    const existingRecord = {
      cardKey: createCardKey("old-block-key"),
      identityMode: "embedded-note-id" as const,
      noteId: 42,
      filePath: "notes/current.md",
      sourceHash: card.contentHash,
      lastSyncedAt: 1,
      orphan: false,
    };
    const registry = new SyncRegistry([existingRecord]);
    const repository = new InMemorySyncRegistryRepository(registry);
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      registry,
      plan: {
        toCreateDecks: [],
        toAdd: [],
        toUpdate: [],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(repository.savedRegistry?.findByNoteId(42)?.cardKey).toBe(card.key);
  });

  it("updates embedded-note-id cards even when the local registry entry is missing", async () => {
    const templateCard = createCard();
    const card = createCard({
      key: createCardKey("embedded-without-registry"),
      embeddedNoteId: 42,
      source: {
        ...templateCard.source,
        sourceContent: ["#### Prompt", "Answer", "<!-- AHS:42 -->"].join("\n"),
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
      },
    });
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    ankiGateway.noteSummariesById.set(42, { noteId: 42, modelName: "Basic" });
    const repository = new InMemorySyncRegistryRepository();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [],
        toUpdate: [{ card, noteId: 42 }],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.updatedNotes[0]?.noteId).toBe(42);
    expect(repository.savedRegistry?.findByNoteId(42)).toMatchObject({ identityMode: "embedded-note-id" });
  });

  it("recreates a missing embedded note and replaces the block-end AHS marker", async () => {
    const templateCard = createCard();
    const card = createCard({
      key: createCardKey("embedded-missing-note"),
      embeddedNoteId: 42,
      source: {
        ...templateCard.source,
        sourceContent: ["#### Prompt", "Answer", "<!-- AHS:42 -->"].join("\n"),
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
      },
    });
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [],
        toUpdate: [{ card, noteId: 42 }],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(vaultGateway.files.get("notes/current.md")).toBe(["#### Prompt", "Answer", "<!-- AHS:9001 -->"].join("\n"));
    expect(repository.savedRegistry?.findByNoteId(9001)).toMatchObject({ identityMode: "embedded-note-id" });
  });

  it("rejects basic/cloze type switching for embedded-note-id cards", async () => {
    const templateCard = createCard();
    const card = createCard({
      key: createCardKey("embedded-type-switch"),
      type: "cloze",
      noteModel: createNoteModelName("Cloze"),
      embeddedNoteId: 42,
      source: {
        ...templateCard.source,
        sourceContent: ["##### Prompt", "{answer}", "<!-- AHS:42 -->"].join("\n"),
        headingLevel: 5,
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
      },
    });
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    ankiGateway.noteSummariesById.set(42, { noteId: 42, modelName: "Basic" });
    const repository = new InMemorySyncRegistryRepository();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await expect(
      useCase.execute(createResult({
        cards: [card],
        plan: {
          toCreateDecks: [createDeckName("Deck")],
          toAdd: [],
          toUpdate: [{ card, noteId: 42 }],
          toMarkOrphan: [],
        },
      })),
    ).rejects.toThrow("Recreate the card instead of switching basic/cloze types");
  });

  it("keeps legacy-card-key behavior for old cards without AHS markers", async () => {
    const card = createCard();
    const legacyRecord = {
      cardKey: card.key,
      identityMode: "legacy-card-key" as const,
      noteId: 77,
      filePath: card.source.filePath,
      sourceHash: createContentHash("old-hash"),
      lastSyncedAt: 1,
      orphan: false,
    };
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    const repository = new InMemorySyncRegistryRepository(new SyncRegistry([legacyRecord]));
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      registry: new SyncRegistry([legacyRecord]),
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [],
        toUpdate: [{ card, noteId: 77 }],
        toMarkOrphan: [],
      },
    }));

    expect(ankiGateway.updatedNotes[0]?.noteId).toBe(77);
    expect(vaultGateway.files.get("notes/current.md")).toBe(card.source.sourceContent);
    expect(repository.savedRegistry?.get(card.key)).toMatchObject({ identityMode: "legacy-card-key" });
  });

  it("promotes pending-note-id-write records after a later successful marker retry", async () => {
    const card = createCard();
    const pendingRecord = {
      cardKey: card.key,
      identityMode: "pending-note-id-write" as const,
      legacyCardKey: card.key,
      noteId: 42,
      filePath: card.source.filePath,
      sourceHash: createContentHash("old-hash"),
      lastSyncedAt: 1,
      orphan: false,
    };
    const vaultGateway = new FakeVaultGateway({ "notes/current.md": card.source.sourceContent ?? "" });
    const ankiGateway = new FakeAnkiGateway();
    ankiGateway.noteSummariesById.set(42, { noteId: 42, modelName: "Basic" });
    const repository = new InMemorySyncRegistryRepository(new SyncRegistry([pendingRecord]));
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await useCase.execute(createResult({
      cards: [card],
      registry: new SyncRegistry([pendingRecord]),
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [],
        toUpdate: [{ card, noteId: 42 }],
        toMarkOrphan: [],
      },
    }));

    expect(vaultGateway.files.get("notes/current.md")).toBe(["#### Prompt", "Answer", "<!-- AHS:42 -->"].join("\n"));
    expect(repository.savedRegistry?.findByNoteId(42)).toMatchObject({ identityMode: "embedded-note-id" });
  });

  it("marks orphan records locally without any delete path", async () => {
    const ankiGateway = new FakeAnkiGateway();
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const orphanRecord = {
      cardKey: createCardKey("orphan-card"),
      identityMode: "legacy-card-key" as const,
      noteId: 42,
      filePath: "notes/orphan.md",
      sourceHash: createContentHash("old-hash"),
      lastSyncedAt: 1,
      orphan: false,
    };
    const repository = new InMemorySyncRegistryRepository(new SyncRegistry([orphanRecord]));
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    const execution = await useCase.execute(createResult({
      cards: [card],
      registry: new SyncRegistry([orphanRecord]),
      plan: {
        toCreateDecks: [createDeckName("Deck")],
        toAdd: [card],
        toUpdate: [],
        toMarkOrphan: [orphanRecord],
      },
    }));

    expect(execution.created).toBe(1);
    expect(execution.markedOrphan).toBe(1);
    expect(repository.savedRegistry?.get(createCardKey("orphan-card"))?.orphan).toBe(true);
  });

  it("blocks sync when a selected note type has no saved mapping", async () => {
    const ankiGateway = new FakeAnkiGateway();
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const repository = new InMemorySyncRegistryRepository();
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await expect(
      useCase.execute({
        ...createResult(),
        cards: [card],
        noteFieldMappings: {},
        plan: {
          toCreateDecks: [createDeckName("Deck")],
          toAdd: [card],
          toUpdate: [],
          toMarkOrphan: [],
        },
      }),
    ).rejects.toThrow("Open plugin settings and read fields from Anki first");
  });

  it("blocks sync when a saved mapping becomes stale", async () => {
    const ankiGateway = new FakeAnkiGateway();
    ankiGateway.modelDetailsByName.Basic = { fieldNames: ["Front", "Body"], isCloze: false };
    const vaultGateway = new FakeVaultGateway({
      "notes/current.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const repository = new InMemorySyncRegistryRepository();
    const card = createCard();
    const useCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, vaultGateway, undefined, () => 1234);

    await expect(
      useCase.execute({
        ...createResult(),
        cards: [card],
        plan: {
          toCreateDecks: [createDeckName("Deck")],
          toAdd: [card],
          toUpdate: [],
          toMarkOrphan: [],
        },
      }),
    ).rejects.toThrow("is stale because these fields no longer exist in Anki");
  });
});