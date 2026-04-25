import { describe, expect, it } from "vitest";

import { buildGroupSrc, type GroupItem, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import { createEmptyPluginState, type GroupBlockState } from "@/domain/manual-sync/entities/PluginState";
import { applyObsidianBacklinkPlacement, renderObsidianBacklinkAnchor } from "@/domain/shared/renderObsidianBacklink";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway, QA_GROUP_USER_NOTE_TYPE } from "@/test-support/manualSyncFakes";

import { QaGroupSyncService } from "./QaGroupSyncService";

describe("QaGroupSyncService", () => {
  it("creates one QA Group note from the user-selected template and assigns fresh item ids and slots", async () => {
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
    expect(ankiGateway.createdModels).toEqual([]);
    expect(ankiGateway.addedNotes[0]?.modelName).toBe(QA_GROUP_USER_NOTE_TYPE);
    expect(ankiGateway.addedNotes[0]?.fields.题目).toBe("Concepts");
    expect(ankiGateway.addedNotes[0]?.fields.问题01).toBe("Alpha");
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain("First answer");
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain("anki-heading-sync-backlink");
    expect(ankiGateway.addedNotes[0]?.fields.问题02).toBe("Beta");
    expect(ankiGateway.addedNotes[0]?.fields.答案02).toContain("Second answer");
    expect(ankiGateway.addedNotes[0]?.fields).not.toHaveProperty("GroupId");
    expect(ankiGateway.addedNotes[0]?.fields).not.toHaveProperty("Src");
    expect(result.syncedGroupBlocks[0]?.items).toMatchObject([
      { itemId: "item-1", slot: 1 },
      { itemId: "item-2", slot: 2 },
    ]);
    expect(result.markerWrites[0]?.itemToSlot).toEqual({ "item-1": 1, "item-2": 2 });
    expect(result.markerWrites[0]?.freeSlots).toEqual([3]);
  });

  it("writes the stem to the user-selected QA Group title field", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.modelDetailsByName[QA_GROUP_USER_NOTE_TYPE] = {
      fieldNames: ["题目", "标题", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"],
      isCloze: false,
    };
    const baseSettings = createModule3Settings();
    const service = new QaGroupSyncService(ankiGateway);

    await service.sync([createIndexedGroupBlock()], createEmptyPluginState(), createModule3Settings({
      noteFieldMappings: {
        ...baseSettings.noteFieldMappings,
        [`qa-group:${QA_GROUP_USER_NOTE_TYPE}`]: {
          cardType: "qa-group",
          modelName: QA_GROUP_USER_NOTE_TYPE,
          loadedFieldNames: ["题目", "标题", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"],
          titleField: "标题",
          slots: [
            { index: 1, questionField: "问题01", answerField: "答案01" },
            { index: 2, questionField: "问题02", answerField: "答案02" },
            { index: 3, questionField: "问题03", answerField: "答案03" },
          ],
          warnings: [],
          loadedAt: 1,
        },
      },
    }));

    expect(ankiGateway.addedNotes[0]?.fields.标题).toBe("Concepts");
    expect(ankiGateway.addedNotes[0]?.fields).not.toHaveProperty("题目");
  });

  it("renders QA Group stem, questions, and answers as inline Markdown HTML", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-1",
      () => "item-1",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        stem: "Concepts *Stem*",
        items: [
          {
            title: "Alpha **bold**",
            answer: "First *answer* and ==mark== #3地区",
            ordinalInMarkdown: 1,
          },
        ],
      }),
    ], createEmptyPluginState(), createModule3Settings());

    expect(result.created).toBe(1);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      题目: "Concepts <em>Stem</em>",
      问题01: "Alpha <strong>bold</strong>",
    });
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain("First <em>answer</em> and <mark>mark</mark>");
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain('class="ahs-ob-tag"');
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain('data-tag="3地区"');
  });

  it("writes the backlink directly into user fields instead of a managed Src field", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-1",
      () => "item-1",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    await service.sync([
      createIndexedGroupBlock(),
    ], createEmptyPluginState(), createModule3Settings({
      obsidianBacklinkLabel: "Open <Vault>",
      obsidianBacklinkPlacement: "answer-first-line",
    }));

    expect(ankiGateway.createdModels).toEqual([]);
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toContain('Open &lt;Vault&gt;');
    expect(ankiGateway.addedNotes[0]?.fields.答案01).toMatch(/^<p><a class="anki-heading-sync-backlink"/);
    expect(ankiGateway.addedNotes[0]?.fields).not.toHaveProperty("Src");
  });

  it("preserves slots across reorder and reuses a free slot for a new item", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_USER_NOTE_TYPE,
      cardIds: [7001, 7002],
      deckNames: ["notes"],
      fields: buildQaGroupUserTemplateFields(existingState.stem, existingState.items),
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
    expect(ankiGateway.addedNotes[0]?.modelName).toBe(QA_GROUP_USER_NOTE_TYPE);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      题目: "Concepts",
      问题01: "Alpha",
      问题02: "Gamma",
      问题03: "Beta",
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
      问题01: "Alpha",
      问题03: "Beta",
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
      modelName: QA_GROUP_USER_NOTE_TYPE,
      cardIds: [7001],
      deckNames: ["notes"],
      fields: buildQaGroupUserTemplateFields(existingState.stem, [
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
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).toContain("第一段");
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).not.toContain("#项目A");
  });

  it("renders remaining inline tags in QA Group answers as chips after cleanup", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_USER_NOTE_TYPE,
      cardIds: [7001],
      deckNames: ["notes"],
      fields: buildQaGroupUserTemplateFields(existingState.stem, [
        { itemId: "item-a", slot: 1, title: "Alpha", answer: "旧答案", ordinalInMarkdown: 1 },
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
          { title: "Alpha", answer: "#项目A #重点/案例\n\n这是 #3地区 的案例\n`#代码`", ordinalInMarkdown: 1 },
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
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).toContain('class="ahs-ob-tag"');
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).toContain('data-tag="3地区"');
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).not.toContain('data-tag="项目A"');
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).not.toContain('data-tag="重点::案例"');
    expect(ankiGateway.updatedNotes[0]?.fields.答案01).not.toContain('data-tag="代码"');
  });

  it("syncs QA Group note tags from file-level tag hints", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const existingState = createStoredGroupBlockState();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_USER_NOTE_TYPE,
      cardIds: [7001],
      deckNames: ["notes"],
      tags: ["old", "shared"],
      fields: buildQaGroupUserTemplateFields(existingState.stem, existingState.items),
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

  it("migrates an existing QA Group note in place when the bound note model changed", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: "旧问答模板",
      cardIds: [7001],
      deckNames: ["notes"],
      tags: ["old"],
      fields: {
        题目: "旧题目",
        问题01: "旧问题",
        答案01: "旧答案",
      },
    });
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-1",
      () => "item-1",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        tagsHint: ["fresh"],
      }),
    ], createEmptyPluginState(), createModule3Settings());

    expect(result.updated).toBe(1);
    expect(result.migratedNoteTypes).toBe(1);
    expect(result.resolvedNoteIds.get("notes/example.md\u0000group\u00001\u0000hash-1")).toBe(42);
    expect(ankiGateway.addedNotes).toEqual([]);
    expect(ankiGateway.updatedNotes).toEqual([]);
    expect(ankiGateway.updatedNoteModels).toEqual([
      {
        noteId: 42,
        modelName: QA_GROUP_USER_NOTE_TYPE,
        fields: expect.objectContaining({
          题目: "Concepts",
          问题01: "Alpha",
          答案01: expect.stringContaining("First answer"),
          问题02: "Beta",
          答案02: expect.stringContaining("Second answer"),
        }),
      },
    ]);
    expect(ankiGateway.syncedNoteTags).toEqual([
      {
        noteId: 42,
        addTags: ["fresh"],
        removeTags: ["old"],
      },
    ]);
  });

  it("migrates into a smaller QA Group template when the current markdown still fits and clears unused slots", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    ankiGateway.modelDetailsByName["问答题（6组）"] = {
      fieldNames: [
        "题目",
        "问题01", "答案01",
        "问题02", "答案02",
        "问题03", "答案03",
        "问题04", "答案04",
        "问题05", "答案05",
        "问题06", "答案06",
      ],
      isCloze: false,
    };
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: "旧问答模板 12 组",
      cardIds: [7001],
      deckNames: ["notes"],
      fields: { 题目: "旧题目" },
    });
    const service = new QaGroupSyncService(
      ankiGateway,
      undefined,
      undefined,
      undefined,
      () => 1234,
      () => "group-1",
      () => "item-1",
      vaultGateway.createBacklink.bind(vaultGateway),
    );

    const result = await service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
        items: [
          { title: "A", answer: "1", ordinalInMarkdown: 1 },
          { title: "B", answer: "2", ordinalInMarkdown: 2 },
          { title: "C", answer: "3", ordinalInMarkdown: 3 },
          { title: "D", answer: "4", ordinalInMarkdown: 4 },
          { title: "E", answer: "5", ordinalInMarkdown: 5 },
        ],
      }),
    ], createEmptyPluginState(), createModule3Settings({
      cardTypeConfigs: {
        ...createModule3Settings().cardTypeConfigs,
        "qa-group": {
          ...createModule3Settings().cardTypeConfigs["qa-group"],
          noteType: "问答题（6组）",
        },
      },
      noteFieldMappings: {
        ...createModule3Settings().noteFieldMappings,
        "qa-group:问答题（6组）": {
          cardType: "qa-group",
          modelName: "问答题（6组）",
          loadedFieldNames: [
            "题目",
            "问题01", "答案01",
            "问题02", "答案02",
            "问题03", "答案03",
            "问题04", "答案04",
            "问题05", "答案05",
            "问题06", "答案06",
          ],
          titleField: "题目",
          slots: [
            { index: 1, questionField: "问题01", answerField: "答案01" },
            { index: 2, questionField: "问题02", answerField: "答案02" },
            { index: 3, questionField: "问题03", answerField: "答案03" },
            { index: 4, questionField: "问题04", answerField: "答案04" },
            { index: 5, questionField: "问题05", answerField: "答案05" },
            { index: 6, questionField: "问题06", answerField: "答案06" },
          ],
          warnings: [],
          loadedAt: 1,
        },
      },
    }));

    expect(result.migratedNoteTypes).toBe(1);
    expect(ankiGateway.updatedNoteModels[0]?.modelName).toBe("问答题（6组）");
    expect(ankiGateway.updatedNoteModels[0]?.fields).toMatchObject({
      题目: "Concepts",
      问题01: "A",
      答案01: expect.stringContaining("1"),
      问题05: "E",
      答案05: expect.stringContaining("5"),
      问题06: "",
      答案06: "",
    });
  });

  it("surfaces a user-facing error when QA Group note type migration fails", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.updateNoteModelError = new Error("AnkiConnect updateNoteModel failed for note 42 to model 问答题（多级列表）: unsupported action");
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: "旧问答模板",
      cardIds: [7001],
      deckNames: ["notes"],
      fields: { 题目: "旧题目" },
    });
    const service = new QaGroupSyncService(ankiGateway);

    await expect(service.sync([
      createIndexedGroupBlock({
        noteId: 42,
        groupId: "group-1",
      }),
    ], createEmptyPluginState(), createModule3Settings())).rejects.toMatchObject({
      userMessage: {
        key: "errors.noteTypeMigration.unsupported",
      },
    });

    expect(ankiGateway.addedNotes).toEqual([]);
    expect(ankiGateway.updatedNoteModels).toEqual([]);
  });

  it("rejects a QA Group block when the selected template exposes fewer slots than the block needs", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new QaGroupSyncService(ankiGateway);

    await expect(service.sync([
      createIndexedGroupBlock({
        items: [
          { title: "A", answer: "1", ordinalInMarkdown: 1 },
          { title: "B", answer: "2", ordinalInMarkdown: 2 },
          { title: "C", answer: "3", ordinalInMarkdown: 3 },
          { title: "D", answer: "4", ordinalInMarkdown: 4 },
        ],
      }),
    ], createEmptyPluginState(), createModule3Settings())).rejects.toMatchObject({
      userMessage: {
        key: "errors.noteFieldMapping.qaGroupSlotCapacityExceeded",
      },
    });
  });

  it("blocks sync when the selected QA Group template still has unconfirmed field warnings", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.modelDetailsByName[QA_GROUP_USER_NOTE_TYPE] = {
      fieldNames: ["题目", "问题01", "答案01", "问题02"],
      isCloze: false,
    };
    const service = new QaGroupSyncService(ankiGateway);
    const baseSettings = createModule3Settings();

    await expect(service.sync([
      createIndexedGroupBlock(),
    ], createEmptyPluginState(), {
      ...baseSettings,
      noteFieldMappings: {
        ...baseSettings.noteFieldMappings,
        [`qa-group:${QA_GROUP_USER_NOTE_TYPE}`]: {
          cardType: "qa-group",
          modelName: QA_GROUP_USER_NOTE_TYPE,
          loadedFieldNames: ["题目", "问题01", "答案01", "问题02"],
          titleField: "题目",
          slots: [{ index: 1, questionField: "问题01", answerField: "答案01" }],
          warnings: [JSON.stringify({ kind: "missing-answer", index: 2, questionField: "问题02", answerField: "答案02" })],
          loadedAt: 1,
        },
      },
    })).rejects.toMatchObject({
      userMessage: {
        key: "errors.noteFieldMapping.qaGroupWarningsUnaccepted",
      },
    });
  });

  it("fails clearly when QA Group sync starts without a selected Anki note type", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new QaGroupSyncService(ankiGateway);
    const baseSettings = createModule3Settings();

    await expect(service.sync([
      createIndexedGroupBlock(),
    ], createEmptyPluginState(), {
      ...baseSettings,
      cardTypeConfigs: {
        ...baseSettings.cardTypeConfigs,
        "qa-group": {
          ...baseSettings.cardTypeConfigs["qa-group"],
          noteType: "",
        },
      },
    })).rejects.toMatchObject({
      userMessage: {
        key: "errors.noteFieldMapping.noteTypeNotSelected.qaGroup",
      },
    });
  });

  it("recovers note content by noteId and uses temporary item ids when local state is missing", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    ankiGateway.noteDetailsById.set(42, {
      noteId: 42,
      modelName: QA_GROUP_USER_NOTE_TYPE,
      cardIds: [7001],
      deckNames: ["notes"],
      fields: buildQaGroupUserTemplateFields("Concepts", [
        { itemId: "ignored", slot: 1, title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
      ], buildBacklinkAnchor(vaultGateway, "notes/example.md", "Concepts #anki-list")),
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
        groupId: undefined,
        items: [{ title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 }],
      }),
    ], createEmptyPluginState(), createModule3Settings());

    expect(result.updated).toBe(0);
    expect(result.syncedGroupBlocks[0]?.items[0]).toMatchObject({
      itemId: "recovered-slot-01",
      slot: 1,
    });
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
    freeSlots: [2],
    lastSyncedAt: 100,
    orphan: false,
  };
}

function buildQaGroupUserTemplateFields(
  stem: string,
  items: GroupItem[],
  backlinkAnchor = buildBacklinkAnchor(new FakeManualSyncVaultGateway(), "notes/example.md", "Concepts #anki-list"),
  placement: "question-last-line" | "answer-first-line" | "answer-last-line" = "answer-last-line",
): Record<string, string> {
  const fields: Record<string, string> = {
    题目: placement === "question-last-line"
      ? applyObsidianBacklinkPlacement({ title: stem, body: "" }, backlinkAnchor, placement).title
      : stem,
    问题01: "",
    答案01: "",
    问题02: "",
    答案02: "",
    问题03: "",
    答案03: "",
  };

  for (const item of items) {
    if (!item.slot) {
      continue;
    }

    fields[`问题${String(item.slot).padStart(2, "0")}`] = item.title;
    fields[`答案${String(item.slot).padStart(2, "0")}`] = placement === "question-last-line"
      ? item.answer
      : applyObsidianBacklinkPlacement({ title: item.title, body: item.answer }, backlinkAnchor, placement).body;
  }

  return fields;
}

function buildBacklinkAnchor(vaultGateway: FakeManualSyncVaultGateway, filePath: string, headingText: string): string {
  return renderObsidianBacklinkAnchor({
    href: vaultGateway.createBacklink({ filePath, headingText }),
    label: "Open in Obsidian",
  });
}
