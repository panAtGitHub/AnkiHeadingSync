import { describe, expect, it } from "vitest";

import type { PluginSettings } from "@/application/config/PluginSettings";
import { createDeckRulesFingerprint } from "@/application/services/FileIndexerService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { CardState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { CurrentFileOutOfScopeError, ManualSyncService } from "./ManualSyncService";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway, InMemoryPluginStateRepository } from "@/test-support/manualSyncFakes";

describe("ManualSyncService", () => {
  it("syncs one file, creates Anki notes, writes the new marker format, and saves plugin state", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createModule3Settings());

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.migratedDecks).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(ankiGateway.addedNotes[0]?.deckName).toBe("notes");
    expect(ankiGateway.ensuredDecks).toEqual([["notes"]]);
    expect(ankiGateway.deletedNotes).toEqual([]);
    expect(ankiGateway.deletedDecks).toEqual([]);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=");
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("note=9001");
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

    const result = await service.syncFile("notes/example.md", createModule3Settings());

    expect(result.markerWriteConflictFiles).toEqual(["notes/example.md"]);
    expect(stateRepository.savedState?.pendingWriteBack).toHaveLength(1);
    expect(stateRepository.savedState?.pendingWriteBack[0]).toMatchObject({ filePath: "notes/example.md", noteId: 9001 });
  });

  it("rebuilds the card index and writes card-only markers without calling Anki", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.rebuildIndex(createModule3Settings());

    expect(result.created).toBe(0);
    expect(result.rewrittenMarkers).toBe(1);
    expect(result.migratedDecks).toBe(0);
    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(ankiGateway.changedDecks).toEqual([]);
    expect(ankiGateway.deletedNotes).toEqual([]);
    expect(ankiGateway.deletedDecks).toEqual([]);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("note=");
  });

  it("rebuildIndex does not migrate decks even when deck rules changed", async () => {
    const oldSettings = createModule3Settings({ defaultDeck: "Old::Deck", folderDeckMode: "off" });
    const newSettings = createModule3Settings({ defaultDeck: "New::Deck", folderDeckMode: "folder" });
    const content = ["#### Prompt", "Answer"].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "课程/数学/第一章/导数.md": content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "课程/数学/第一章/导数.md": {
          filePath: "课程/数学/第一章/导数.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          cardIds: ["ahs_known"],
        },
      },
      cards: {
        ahs_known: createStoredSyncedCard(oldSettings, {
          filePath: "课程/数学/第一章/导数.md",
          deck: "Old::Deck",
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.rebuildIndex(newSettings);

    expect(result.migratedDecks).toBe(0);
    expect(ankiGateway.changedDecks).toEqual([]);
  });

  it("restores the original marker without creating a new Anki note when marker was deleted but content is unchanged", async () => {
    const settings = createModule3Settings();
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const storedCard = createStoredSyncedCard(settings);
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        ahs_known: storedCard,
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

    const result = await service.syncFile("notes/example.md", settings);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=ahs_known note=42 -->");
  });

  it("creates a new Anki note when marker was deleted and the card content changed", async () => {
    const settings = createModule3Settings();
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Updated Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        ahs_known: createStoredSyncedCard(settings),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", settings);

    expect(result.created).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("note=9001");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("AHS:card=ahs_known note=42");
    expect(stateRepository.savedState?.cards.ahs_known?.orphan).toBe(true);
    expect(
      Object.values(stateRepository.savedState?.cards ?? {}).some((card) => card.cardId !== "ahs_known" && card.noteId === 9001 && !card.orphan),
    ).toBe(true);
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

    const result = await service.syncFile("notes/example.md", createModule3Settings());

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

    await service.syncFile("课程/数学/第一章/导数.md", createModule3Settings());

    expect(ankiGateway.addedNotes[0]?.deckName).toBe("课程::数学::第一章");
    expect(ankiGateway.ensuredDecks).toEqual([["课程::数学::第一章"]]);
  });

  it("migrates an existing note when only the resolved deck changes", async () => {
    const settings = createModule3Settings({ defaultDeck: "New::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "example.md": ["#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n"),
    });
    const indexedCard = {
      cardId: "ahs_known",
      noteId: 42,
      markerNoteId: 42,
      filePath: "example.md",
      cardType: "basic" as const,
      heading: "Prompt",
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
      markerState: "card-and-note" as const,
    };
    const oldSettings = createModule3Settings({ defaultDeck: "Old::Deck" });
    const renderPlan = new RenderConfigService().resolve(indexedCard, oldSettings);
    const stateRepository = new InMemoryPluginStateRepository({
      files: {},
      cards: {
        ahs_known: createStoredSyncedCard(settings, {
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
    });
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("example.md", settings);

    expect(result.updated).toBe(0);
    expect(result.migratedDecks).toBe(1);
    expect(ankiGateway.updatedNotes).toHaveLength(0);
    expect(ankiGateway.changedDecks).toEqual([{ deckName: "New::Deck", cardIds: [7001] }]);
  });

  it("ordinary sync re-evaluates unchanged files when folder deck rules changed and migrates old notes", async () => {
    const oldSettings = createModule3Settings({ folderDeckMode: "off", defaultDeck: "Default::Deck" });
    const newSettings = createModule3Settings({ folderDeckMode: "folder", defaultDeck: "Default::Deck" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "课程/数学/第一章/导数.md": ["#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        "课程/数学/第一章/导数.md": {
          filePath: "课程/数学/第一章/导数.md",
          fileHash: "hash-a",
          fileStamp: `1:${["#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n").length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          cardIds: ["ahs_known"],
        },
      },
      cards: {
        ahs_known: createStoredSyncedCard(oldSettings, {
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
    expect(stateRepository.savedState?.cards.ahs_known?.deck).toBe("课程::数学::第一章");
    expect(stateRepository.savedState?.files["课程/数学/第一章/导数.md"]?.deckRulesFingerprint).toBe(createDeckRulesFingerprint(newSettings));
  });

  it("ordinary sync re-evaluates unchanged files when default deck changed and migrates root-level notes", async () => {
    const content = ["#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n");
    const oldSettings = createModule3Settings({ defaultDeck: "Old::Deck", folderDeckMode: "off" });
    const newSettings = createModule3Settings({ defaultDeck: "New::Deck", folderDeckMode: "off" });
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
          cardIds: ["ahs_known"],
        },
      },
      cards: {
        ahs_known: createStoredSyncedCard(oldSettings, {
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
    const content = ["MY DECK: Scoped::Deck", "", "#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n");
    const oldSettings = createModule3Settings({ fileDeckMarker: "TARGET DECK", defaultDeck: "Default::Deck" });
    const newSettings = createModule3Settings({ fileDeckMarker: "MY DECK", defaultDeck: "Default::Deck" });
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
          cardIds: ["ahs_known"],
        },
      },
      cards: {
        ahs_known: createStoredSyncedCard(oldSettings, {
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
    const content = ["TARGET DECK: Scoped::Deck", "", "#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n");
    const oldSettings = createModule3Settings({ fileDeckEnabled: false, defaultDeck: "Default::Deck" });
    const newSettings = createModule3Settings({ fileDeckEnabled: true, defaultDeck: "Default::Deck" });
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
          cardIds: ["ahs_known"],
        },
      },
      cards: {
        ahs_known: createStoredSyncedCard(oldSettings, {
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
});

function createStoredSyncedCard(settings: PluginSettings, overrides: Partial<CardState> = {}): CardState {
  const heading = overrides.heading ?? "Prompt";
  const bodyMarkdown = overrides.bodyMarkdown ?? "Answer";
  const rawBlockText = overrides.rawBlockText ?? [`#### ${heading}`, bodyMarkdown].join("\n");
  const rawBlockHash = overrides.rawBlockHash ?? hashString(rawBlockText);
  const indexedCard = {
    cardId: overrides.cardId ?? "ahs_known",
    noteId: overrides.noteId ?? 42,
    markerNoteId: overrides.noteId ?? 42,
    filePath: overrides.filePath ?? "notes/example.md",
    cardType: overrides.cardType ?? "basic",
    heading,
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
    markerState: "card-and-note" as const,
  };
  const renderPlan = new RenderConfigService().resolve(indexedCard, settings);

  return {
    cardId: indexedCard.cardId,
    noteId: indexedCard.noteId,
    filePath: indexedCard.filePath,
    heading: indexedCard.heading,
    headingLevel: indexedCard.headingLevel,
    bodyMarkdown: indexedCard.bodyMarkdown,
    cardType: indexedCard.cardType,
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