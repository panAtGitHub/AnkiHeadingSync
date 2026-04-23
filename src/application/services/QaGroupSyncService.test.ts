import { describe, expect, it } from "vitest";

import { buildGroupSrc, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import { createEmptyPluginState, type GroupBlockState } from "@/domain/manual-sync/entities/PluginState";
import { QA_GROUP_MODEL_NAME, buildQaGroupNoteFields } from "@/application/services/QaGroupModelDefinition";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway } from "@/test-support/manualSyncFakes";

import { QaGroupSyncService } from "./QaGroupSyncService";

describe("QaGroupSyncService", () => {
  it("creates one QA Group note and assigns fresh item ids and slots", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const itemIds = ["item-1", "item-2"];
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-1",
      () => itemIds.shift() ?? "item-x",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([createIndexedGroupBlock()], createEmptyPluginState(), createModule3Settings());

    expect(result.created).toBe(1);
    expect(ankiGateway.addedNotes[0]?.modelName).toBe(QA_GROUP_MODEL_NAME);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      Stem: "Concepts",
      GroupId: "group-1",
      Src: "obsidian://open?vault=Vault&file=notes/example.md#Concepts #anki-list",
      S01_Q: "Alpha",
      S01_A: "First answer",
      S02_Q: "Beta",
      S02_A: "Second answer",
    });
    expect(result.syncedGroupBlocks[0]?.items).toMatchObject([
      { itemId: "item-1", slot: 1 },
      { itemId: "item-2", slot: 2 },
    ]);
    expect(result.markerWrites[0]?.itemToSlot).toEqual({ "item-1": 1, "item-2": 2 });
  });

  it("preserves slots across reorder and reuses a free slot for a new item", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_MODEL_NAME,
      cardIds: [7001, 7002],
      deckNames: ["notes"],
      fields: buildQaGroupNoteFields(existingState.stem, existingState.groupId, existingState.src, existingState.items),
    });
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-x",
      () => "item-c",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        rawBlockHash: "hash-updated",
        items: [
          { title: "Beta", answer: "Second answer", ordinalInMarkdown: 1 },
          { title: "Gamma", answer: "Third answer", ordinalInMarkdown: 2 },
          { title: "Alpha", answer: "First answer", ordinalInMarkdown: 3 },
        ],
      }),
    ], {
      ...createEmptyPluginState(),
      groupBlocks: {
        "group-1": existingState,
      },
    }, createModule3Settings());

    expect(result.updated).toBe(1);
    expect(result.syncedGroupBlocks[0]?.items).toMatchObject([
      { title: "Beta", itemId: "item-b", slot: 3 },
      { title: "Gamma", itemId: "item-c", slot: 2 },
      { title: "Alpha", itemId: "item-a", slot: 1 },
    ]);
    expect(result.markerWrites[0]?.itemToSlot).toEqual({
      "item-a": 1,
      "item-c": 2,
      "item-b": 3,
    });
  });

  it("recreates a missing QA Group note instead of failing when the stored noteId no longer exists", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-x",
      () => "item-new",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        rawBlockHash: "hash-updated",
        items: [
          { title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
          { title: "Beta", answer: "Second answer", ordinalInMarkdown: 2 },
          { title: "Gamma", answer: "Third answer", ordinalInMarkdown: 3 },
        ],
      }),
    ], {
      ...createEmptyPluginState(),
      groupBlocks: {
        "group-1": existingState,
      },
    }, createModule3Settings());

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(ankiGateway.addedNotes[0]?.modelName).toBe(QA_GROUP_MODEL_NAME);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      GroupId: "group-1",
      S01_Q: "Alpha",
      S02_Q: "Gamma",
      S03_Q: "Beta",
    });
    expect(result.syncedGroupBlocks[0]?.groupId).toBe("group-1");
    expect(result.syncedGroupBlocks[0]?.noteId).toBeDefined();
  });

  it("recreates a missing QA Group note even when the local state looks unchanged", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-x",
      () => "item-new",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        rawBlockHash: existingState.rawBlockHash,
        items: existingState.items.map(({ title, answer, ordinalInMarkdown }) => ({ title, answer, ordinalInMarkdown })),
      }),
    ], {
      ...createEmptyPluginState(),
      groupBlocks: {
        "group-1": existingState,
      },
    }, createModule3Settings());

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.touchedSyncKeys).toContain("notes/example.md\u0000group\u00001\u0000hash-1");
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      GroupId: "group-1",
      S01_Q: "Alpha",
      S03_Q: "Beta",
    });
    expect(result.markerWrites[0]?.noteId).toBe(result.syncedGroupBlocks[0]?.noteId);
    expect(result.syncedGroupBlocks[0]?.noteId).not.toBe(42);
  });

  it("applies pure tag line cleanup to QA Group answer fields when the setting is disabled", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_MODEL_NAME,
      cardIds: [7001],
      deckNames: ["notes"],
      fields: buildQaGroupNoteFields(existingState.stem, existingState.groupId, existingState.src, [
        { itemId: "item-a", slot: 1, title: "Alpha", answer: "#项目A #重点/案例\n\n第一段", ordinalInMarkdown: 1 },
        { itemId: "item-b", slot: 3, title: "Beta", answer: "Second answer", ordinalInMarkdown: 2 },
      ]),
    });
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-x",
      () => "item-new",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        rawBlockHash: existingState.rawBlockHash,
        items: [
          { title: "Alpha", answer: "#项目A #重点/案例\n\n第一段", ordinalInMarkdown: 1 },
          { title: "Beta", answer: "Second answer", ordinalInMarkdown: 2 },
        ],
      }),
    ], {
      ...createEmptyPluginState(),
      groupBlocks: {
        "group-1": existingState,
      },
    }, createModule3Settings({ keepPureTagLinesInCardBody: false }));

    expect(result.updated).toBe(1);
    expect(ankiGateway.updatedNotes[0]?.fields).toMatchObject({
      S01_A: "第一段",
    });
  });

  it("syncs QA Group note tags from file-level tag hints", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_MODEL_NAME,
      cardIds: [7001],
      deckNames: ["notes"],
      tags: ["old", "shared"],
      fields: buildQaGroupNoteFields(existingState.stem, existingState.groupId, existingState.src, existingState.items),
    });
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-x",
      () => "item-new",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        rawBlockHash: existingState.rawBlockHash,
        tagsHint: ["shared", "fresh"],
        items: existingState.items.map(({ title, answer, ordinalInMarkdown }) => ({ title, answer, ordinalInMarkdown })),
      }),
    ], {
      ...createEmptyPluginState(),
      groupBlocks: {
        "group-1": existingState,
      },
    }, createModule3Settings());

    expect(result.updated).toBe(1);
    expect(ankiGateway.syncedNoteTags).toEqual([
      {
        noteId: 42,
        addTags: ["fresh"],
        removeTags: ["old"],
      },
    ]);
  });
});

function createIndexedGroupBlock(overrides: Partial<IndexedGroupCardBlock> = {}): IndexedGroupCardBlock {
  return {
    syncKey: overrides.syncKey ?? "notes/example.md\u0000group\u00001\u0000hash-1",
    markerState: overrides.markerState ?? "missing",
    filePath: overrides.filePath ?? "notes/example.md",
    headingText: overrides.headingText ?? "Concepts #anki-list",
    backlinkHeadingText: overrides.backlinkHeadingText ?? "Concepts #anki-list",
    headingLevel: overrides.headingLevel ?? 4,
    stem: overrides.stem ?? "Concepts",
    src: overrides.src ?? buildGroupSrc("notes/example.md", "Concepts #anki-list"),
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 64,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 5,
    contentEndLine: overrides.contentEndLine ?? 5,
    markerLine: overrides.markerLine,
    markerIndent: overrides.markerIndent,
    rawBlockText: overrides.rawBlockText ?? "qa-group:Concepts",
    rawBlockHash: overrides.rawBlockHash ?? "hash-1",
    deckWarnings: overrides.deckWarnings ?? [],
    tagsHint: overrides.tagsHint,
    items: overrides.items ?? [
      { title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
      { title: "Beta", answer: "Second answer", ordinalInMarkdown: 2 },
    ],
    groupMarker: overrides.groupMarker,
    freeSlots: overrides.freeSlots ?? [],
    sourceContent: overrides.sourceContent ?? [
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "- Beta",
      "  - Second answer",
    ].join("\n"),
    noteId: overrides.noteId,
    groupId: overrides.groupId,
    identitySource: overrides.identitySource,
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
  };
}

function createStoredGroupBlockState(): GroupBlockState {
  return {
    groupId: "group-1",
    noteId: 42,
    filePath: "notes/example.md",
    headingText: "Concepts #anki-list",
    backlinkHeadingText: "Concepts #anki-list",
    headingLevel: 4,
    stem: "Concepts",
    src: buildGroupSrc("notes/example.md", "Concepts #anki-list"),
    blockStartOffset: 0,
    blockEndOffset: 64,
    blockStartLine: 1,
    bodyStartLine: 2,
    blockEndLine: 5,
    contentEndLine: 5,
    rawBlockText: "qa-group:Concepts",
    rawBlockHash: "hash-previous",
    deck: "notes",
    deckWarnings: [],
    items: [
      { itemId: "item-a", title: "Alpha", answer: "First answer", slot: 1, ordinalInMarkdown: 1 },
      { itemId: "item-b", title: "Beta", answer: "Second answer", slot: 3, ordinalInMarkdown: 2 },
    ],
    freeSlots: [2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    lastSyncedAt: 100,
    orphan: false,
  };
}
