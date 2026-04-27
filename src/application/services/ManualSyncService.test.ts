import { describe, expect, it } from "vitest";

import type { PluginSettings } from "@/application/config/PluginSettings";
import { createDeckRulesFingerprint } from "@/application/services/FileIndexerService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { CardState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { CurrentFileOutOfScopeError, ManualSyncService, RunScopeNotConfiguredError } from "./ManualSyncService";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway, InMemoryPluginStateRepository, QA_GROUP_USER_NOTE_TYPE } from "@/test-support/manualSyncFakes";

describe("ManualSyncService", () => {
  it("syncs one file, creates Anki notes, writes the new marker format, and saves plugin state", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createSettingsForSyncPath("notes/example.md"));

    expect(result.created).toBe(1);
    expect(result.rebuilt).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.migratedNoteTypes).toBe(0);
    expect(result.migratedDecks).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(ankiGateway.addedNotes[0]?.deckName).toBe("notes");
    expect(ankiGateway.ensuredDecks).toEqual([["notes"]]);
    expect(ankiGateway.deletedNotes).toEqual([]);
    expect(ankiGateway.deletedDecks).toEqual([]);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!--ID: 9001-->");
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([]);
    expect(Object.values(stateRepository.savedState?.cards ?? {})).toHaveLength(1);
  });

  it("records pending write-back and reports conflict files when markdown changed before write-back", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    vaultGateway.conflictPaths.add("notes/example.md");
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createSettingsForSyncPath("notes/example.md"));

    expect(result.markerWriteConflictFiles).toEqual(["notes/example.md"]);
    expect(stateRepository.savedState?.pendingWriteBack).toHaveLength(1);
    expect(stateRepository.savedState?.pendingWriteBack[0]).toMatchObject({ filePath: "notes/example.md", targetNoteId: 9001 });
  });

  it("syncs a #anki-list block into one user-template QA Group note and writes one GI marker", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": [
        "#### Concepts #anki-list",
        "- Alpha",
        "  - First answer",
        "- Beta",
        "  - Second answer",
      ].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createSettingsForSyncPath("notes/example.md"));

    expect(result.created).toBe(1);
    expect(result.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes[0]?.modelName).toBe(QA_GROUP_USER_NOTE_TYPE);
    expect(ankiGateway.addedNotes[0]?.fields).toMatchObject({
      题目: "Concepts",
      问题01: "Alpha",
      答案01: expect.stringContaining("First answer"),
      问题02: "Beta",
      答案02: expect.stringContaining("Second answer"),
    });
    expect(vaultGateway.getFileContent("notes/example.md")).toMatch(/<!--GI:n=9001;i=[^;]+;f=3-->/);
    expect(Object.values(stateRepository.savedState?.groupBlocks ?? {})).toHaveLength(1);
    expect(stateRepository.savedState?.files["notes/example.md"]?.groupIds).toHaveLength(1);
  });

  it("restores the original marker without creating a new Anki note when marker was deleted but content is unchanged", async () => {
    const settings = createSettingsForSyncPath("notes/example.md");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const storedCard = createStoredSyncedCard(settings);
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        "42": storedCard,
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
      deckNames: ["[[anki背诵]]::[[城市更新，运营类，anki]]"],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", settings);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!--ID: 42-->");
  });

  it("creates a new Anki note when marker was deleted and the card content changed", async () => {
    const settings = createSettingsForSyncPath("notes/example.md");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Updated Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        "42": createStoredSyncedCard(settings),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", settings);

    expect(result.created).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!--ID: 9001-->");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("<!--ID: 42-->");
    expect(stateRepository.savedState?.cards["42"]?.orphan).toBe(true);
    expect(stateRepository.savedState?.cards["9001"]?.orphan).toBe(false);
  });

  it("rebuilds a synced cloze note when switching from sequential to all shrinks the final cloze number set", async () => {
    const settings = createSettingsForSyncPath("notes/example.md");
    const currentRawBlockText = ["#### Cloze #anki-cloze-all", "{A} {B} {C}"].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Cloze #anki-cloze-all", "{A} {B} {C}", "<!--ID: 42-->"] .join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        "42": createStoredSyncedCard(settings, {
          noteId: 42,
          heading: "Cloze #anki-cloze",
          backlinkHeadingText: "Cloze #anki-cloze",
          bodyMarkdown: "{A} {B} {C}",
          cardType: "cloze",
          clozeMode: "sequential",
          rawBlockText: ["#### Cloze #anki-cloze", "{A} {B} {C}"].join("\n"),
          rawBlockHash: hashString(["#### Cloze #anki-cloze", "{A} {B} {C}"].join("\n")),
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Cloze",
      cardIds: [7001, 7002, 7003],
      deckNames: ["notes"],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", settings);

    expect(result.created).toBe(0);
    expect(result.rebuilt).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(ankiGateway.addedNotes[0]?.modelName).toBe("Cloze");
    expect(ankiGateway.deletedNotes).toEqual([[42]]);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!--ID: 9001-->");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("<!--ID: 42-->");
    expect(stateRepository.savedState?.cards["42"]).toBeUndefined();
    expect(stateRepository.savedState?.cards["9001"]?.clozeMode).toBe("all");
    expect(stateRepository.savedState?.cards["9001"]?.rawBlockText).toBe(currentRawBlockText);
    expect(stateRepository.savedState?.files["notes/example.md"]?.noteIds).toEqual([9001]);
  });

  it("uses YAML deck, emits conflict warning, and continues syncing when YAML and body deck declarations differ", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": [
        "---",
        "TARGET DECK: YAML/Deck",
        "---",
        "",
        "TARGET DECK: Body::Deck",
        "",
        "#### Prompt",
        "Answer",
      ].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createSettingsForSyncPath("notes/example.md"));

    expect(result.created).toBe(1);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["deck_conflict_yaml_body"]);
    expect(ankiGateway.addedNotes[0]?.deckName).toBe("YAML::Deck");
  });

  it("maps folder hierarchy to nested Anki decks for new notes", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "课程/数学/第一章/导数.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    await service.syncFile("课程/数学/第一章/导数.md", createSettingsForSyncPath("课程/数学/第一章/导数.md"));

    expect(ankiGateway.addedNotes[0]?.deckName).toBe("课程::数学::第一章");
    expect(ankiGateway.ensuredDecks).toEqual([["课程::数学::第一章"]]);
  });

  it("migrates an existing note when only the resolved deck changes", async () => {
    const settings = createSettingsForSyncPath("example.md", { defaultDeck: "New::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "example.md": ["#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n"),
    });
    const indexedCard = {
      noteId: 42,
      syncKey: "example.md\u00001\u0000hash-card",
      idMarkerState: "present-valid" as const,
      noteIdSource: "marker" as const,
      filePath: "example.md",
      cardType: "basic" as const,
      heading: "Prompt",
      backlinkHeadingText: "Prompt",
      headingLevel: 4,
      bodyMarkdown: "Answer",
      blockStartOffset: 0,
      blockEndOffset: 16,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 3,
      contentEndLine: 2,
      markerLine: 3,
      rawBlockText: ["#### Prompt", "Answer"].join("\n"),
      rawBlockHash: hashString(["#### Prompt", "Answer"].join("\n")),
      deckWarnings: [],
      tagsHint: [],
    };
    const oldSettings = createSettingsForSyncPath("example.md", { defaultDeck: "Old::Deck" });
    const renderPlan = new RenderConfigService().resolve(indexedCard, oldSettings);
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        "42": createStoredSyncedCard(settings, {
          filePath: "example.md",
          deck: "Old::Deck",
          renderConfigHash: renderPlan.renderConfigHash,
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
      deckNames: ["[[anki背诵]]::[[城市更新，运营类，anki]]"],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("example.md", settings);

    expect(result.updated).toBe(0);
    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "New::Deck", cardIds: [7001] }]);
  });

  it("aligns deck for a marker-backed existing note even without prior local state", async () => {
    const settings = createSettingsForSyncPath("999，试验卡片/城市更新，运营类，anki.md", { folderDeckMode: "folder-and-file", defaultDeck: "Obsidian1" });
    const filePath = "999，试验卡片/城市更新，运营类，anki.md";
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: ["#### 城市更新，百人会的核心产品", "Answer", "<!--ID: 42-->"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
      deckNames: ["[[anki背诵]]::[[城市更新，运营类，anki]]"],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile(filePath, settings);

    expect(result.updated).toBe(1);
    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "999，试验卡片::城市更新，运营类，anki", cardIds: [7001] }]);
    expect(stateRepository.savedState?.cards["42"]?.deck).toBe("999，试验卡片::城市更新，运营类，anki");
  });

  it("self-heals deck drift when local state already claims the target deck", async () => {
    const settings = createSettingsForSyncPath("999，试验卡片/城市更新，运营类，anki.md", { folderDeckMode: "folder-and-file", defaultDeck: "Obsidian1" });
    const filePath = "999，试验卡片/城市更新，运营类，anki.md";
    const content = ["#### 城市更新，百人会的核心产品", "Answer", "<!--ID: 42-->"].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const targetDeck = "999，试验卡片::城市更新，运营类，anki";
    const storedCard = createStoredSyncedCard(settings, {
      filePath,
      noteId: 42,
      heading: "城市更新，百人会的核心产品",
      bodyMarkdown: "Answer",
      rawBlockText: ["#### 城市更新，百人会的核心产品", "Answer"].join("\n"),
      rawBlockHash: hashString(["#### 城市更新，百人会的核心产品", "Answer"].join("\n")),
      deck: targetDeck,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: {
          filePath,
          fileHash: hashString(content),
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(settings),
          lastIndexedAt: 1,
          noteIds: [42],
        },
      },
      cards: {
        "42": storedCard,
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
      deckNames: ["[[anki背诵]]::[[城市更新，运营类，anki]]"],
    } as never);
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile(filePath, settings);

    expect(result.updated).toBe(0);
    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: targetDeck, cardIds: [7001] }]);
  });

  it("ordinary sync re-evaluates unchanged files when folder deck rules changed and migrates old notes", async () => {
    const oldSettings = createSettingsForSyncPath("课程/数学/第一章/导数.md", { folderDeckMode: "off", defaultDeck: "Default::Deck" });
    const newSettings = createSettingsForSyncPath("课程/数学/第一章/导数.md", { folderDeckMode: "folder", defaultDeck: "Default::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "课程/数学/第一章/导数.md": ["#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "课程/数学/第一章/导数.md": {
          filePath: "课程/数学/第一章/导数.md",
          fileHash: "hash-a",
          fileStamp: `1:${["#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n").length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [42],
        },
      },
      cards: {
        "42": createStoredSyncedCard(oldSettings, {
          filePath: "课程/数学/第一章/导数.md",
          deck: "Default::Deck",
        }),
      },
      pendingWriteBack: [],
    });
    stateRepository.savedState = await stateRepository.load();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncVault(newSettings);

    expect(result.updated).toBe(0);
    expect(result.migratedDecks).toBe(1);
    expect(vaultGateway.readCalls).toEqual(["课程/数学/第一章/导数.md"]);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "课程::数学::第一章", cardIds: [7001] }]);
    expect(stateRepository.savedState?.cards["42"]?.deck).toBe("课程::数学::第一章");
    expect(stateRepository.savedState?.files["课程/数学/第一章/导数.md"]?.deckRulesFingerprint).toBe(createDeckRulesFingerprint(newSettings));
  });

  it("ordinary sync re-evaluates unchanged files when default deck changed and migrates root-level notes", async () => {
    const content = ["#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n");
    const oldSettings = createSettingsForSyncPath("example.md", { defaultDeck: "Old::Deck", folderDeckMode: "off" });
    const newSettings = createSettingsForSyncPath("example.md", { defaultDeck: "New::Deck", folderDeckMode: "off" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "example.md": content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "example.md": {
          filePath: "example.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [42],
        },
      },
      cards: {
        "42": createStoredSyncedCard(oldSettings, {
          filePath: "example.md",
          deck: "Old::Deck",
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncVault(newSettings);

    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "New::Deck", cardIds: [7001] }]);
  });

  it("ordinary sync re-evaluates unchanged files when file deck marker changes and migrates old notes", async () => {
    const content = ["MY DECK: Scoped::Deck", "", "#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n");
    const oldSettings = createSettingsForSyncPath("notes/example.md", { fileDeckMarker: "TARGET DECK", defaultDeck: "Default::Deck" });
    const newSettings = createSettingsForSyncPath("notes/example.md", { fileDeckMarker: "MY DECK", defaultDeck: "Default::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "notes/example.md": {
          filePath: "notes/example.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [42],
        },
      },
      cards: {
        "42": createStoredSyncedCard(oldSettings, {
          deck: "notes",
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncVault(newSettings);

    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "Scoped::Deck", cardIds: [7001] }]);
    expect(ankiGateway.deletedNotes).toEqual([]);
    expect(ankiGateway.deletedDecks).toEqual([]);
  });

  it("ordinary sync re-evaluates unchanged files when file-level deck is enabled and migrates old notes", async () => {
    const content = ["TARGET DECK: Scoped::Deck", "", "#### Prompt", "Answer", "<!--ID: 42-->"] .join("\n");
    const oldSettings = createSettingsForSyncPath("notes/example.md", { fileDeckEnabled: false, defaultDeck: "Default::Deck" });
    const newSettings = createSettingsForSyncPath("notes/example.md", { fileDeckEnabled: true, defaultDeck: "Default::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "notes/example.md": {
          filePath: "notes/example.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [42],
        },
      },
      cards: {
        "42": createStoredSyncedCard(oldSettings, {
          deck: "notes",
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.noteSummariesById.set(42, {
      noteId: 42,
      modelName: "Basic",
      cardIds: [7001],
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncVault(newSettings);

    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "Scoped::Deck", cardIds: [7001] }]);
  });

  it("skips current file sync when the file is outside the configured scope", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "outside/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    await expect(
      service.syncFile(
        "outside/example.md",
        createModule3Settings({
          scopeMode: "include",
          includeFolders: ["notes"],
        }),
      ),
    ).rejects.toBeInstanceOf(CurrentFileOutOfScopeError);

    expect(vaultGateway.readCalls).toEqual([]);
    expect(ankiGateway.addedNotes).toHaveLength(0);
  });

  it("blocks current file sync when include mode has no selected folders", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    await expect(
      service.syncFile(
        "notes/example.md",
        createModule3Settings({
          scopeMode: "include",
          includeFolders: [],
        }),
      ),
    ).rejects.toBeInstanceOf(RunScopeNotConfiguredError);

    expect(vaultGateway.readCalls).toEqual([]);
    expect(ankiGateway.addedNotes).toHaveLength(0);
  });

  it("blocks vault sync when include mode has no selected folders", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    await expect(
      service.syncVault(createModule3Settings({
        scopeMode: "include",
        includeFolders: [],
      })),
    ).rejects.toBeInstanceOf(RunScopeNotConfiguredError);

    expect(vaultGateway.readCalls).toEqual([]);
    expect(ankiGateway.addedNotes).toHaveLength(0);
  });
});

function createSettingsForSyncPath(filePath: string, overrides: Partial<PluginSettings> = {}): PluginSettings {
  const firstSlashIndex = filePath.indexOf("/");
  if (firstSlashIndex === -1) {
    return createModule3Settings({
      scopeMode: "all",
      ...overrides,
    });
  }

  return createModule3Settings({
    scopeMode: "include",
    includeFolders: [filePath.slice(0, firstSlashIndex)],
    ...overrides,
  });
}

function createStoredSyncedCard(settings: PluginSettings, overrides: Partial<CardState> = {}): CardState {
  const heading = overrides.heading ?? "Prompt";
  const bodyMarkdown = overrides.bodyMarkdown ?? "Answer";
  const rawBlockText = overrides.rawBlockText ?? [`#### ${heading}`, bodyMarkdown].join("\n");
  const rawBlockHash = overrides.rawBlockHash ?? hashString(rawBlockText);
  const noteId = overrides.noteId ?? 42;
  const indexedCard = {
    noteId,
    syncKey: `${overrides.filePath ?? "notes/example.md"}\u0000${overrides.blockStartLine ?? 1}\u0000${rawBlockHash}`,
    idMarkerState: "present-valid" as const,
    noteIdSource: "marker" as const,
    filePath: overrides.filePath ?? "notes/example.md",
    cardType: overrides.cardType ?? "basic",
    clozeMode: overrides.clozeMode,
    heading,
    backlinkHeadingText: overrides.backlinkHeadingText ?? heading,
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown,
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? rawBlockText.length,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 2,
    contentEndLine: overrides.contentEndLine ?? 2,
    markerLine: overrides.markerLine,
    rawBlockText,
    rawBlockHash,
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    tagsHint: overrides.tagsHint ?? [],
  };
  const renderPlan = new RenderConfigService().resolve(indexedCard, settings);

  return {
    noteId: indexedCard.noteId,
    filePath: indexedCard.filePath,
    heading: indexedCard.heading,
    backlinkHeadingText: indexedCard.backlinkHeadingText,
    headingLevel: indexedCard.headingLevel,
    bodyMarkdown: indexedCard.bodyMarkdown,
    cardType: indexedCard.cardType,
    clozeMode: indexedCard.clozeMode,
    blockStartOffset: indexedCard.blockStartOffset,
    blockEndOffset: indexedCard.blockEndOffset,
    blockStartLine: indexedCard.blockStartLine,
    bodyStartLine: indexedCard.bodyStartLine,
    blockEndLine: indexedCard.blockEndLine,
    contentEndLine: indexedCard.contentEndLine,
    markerLine: indexedCard.markerLine,
    rawBlockText: indexedCard.rawBlockText,
    rawBlockHash: indexedCard.rawBlockHash,
    renderConfigHash: overrides.renderConfigHash ?? renderPlan.renderConfigHash,
    deck: overrides.deck ?? renderPlan.deck,
    deckHint: indexedCard.deckHint,
    deckHintSource: indexedCard.deckHintSource,
    deckWarnings: [...indexedCard.deckWarnings],
    tagsHint: indexedCard.tagsHint,
    lastSyncedAt: overrides.lastSyncedAt ?? 1,
    orphan: overrides.orphan ?? false,
  };
}
