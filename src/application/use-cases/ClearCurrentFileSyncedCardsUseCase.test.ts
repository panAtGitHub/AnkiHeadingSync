import { describe, expect, it } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import type { PluginSettings } from "@/application/config/PluginSettings";
import { createDeckRulesFingerprint } from "@/application/services/FileIndexerService";
import { ManualSyncService } from "@/application/services/ManualSyncService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import { buildGroupSrc } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { CardState, FileState, GroupBlockState, PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway, InMemoryPluginStateRepository } from "@/test-support/manualSyncFakes";

import { ClearCurrentFileSyncedCardsUseCase } from "./ClearCurrentFileSyncedCardsUseCase";

describe("ClearCurrentFileSyncedCardsUseCase", () => {
  it("deletes notes, removes markers, deletes local records, and allows later sync to recreate cards", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/example.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 41-->",
      "",
      "#### Prompt 2",
      "Answer 2",
      "<!--ID: 42-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, { noteIds: [41, 42] }),
      },
      cards: {
        "41": createStoredSyncedCard(settings, {
          noteId: 41,
          filePath,
          bodyMarkdown: "Answer",
          rawBlockText: ["#### Prompt", "Answer"].join("\n"),
          contentEndLine: 2,
          blockEndLine: 4,
          markerLine: 3,
        }),
        "42": createStoredSyncedCard(settings, {
          noteId: 42,
          filePath,
          heading: "Prompt 2",
          bodyMarkdown: "Answer 2",
          rawBlockText: ["#### Prompt 2", "Answer 2"].join("\n"),
          blockStartLine: 5,
          bodyStartLine: 6,
          contentEndLine: 6,
          blockEndLine: 7,
          markerLine: 7,
        }),
      },
      pendingWriteBack: [
        {
          filePath,
          blockStartLine: 1,
          expectedFileHash: hashString(content),
          targetMarker: "<!--ID: 41-->",
          rawBlockHash: hashString(["#### Prompt", "Answer"].join("\n")),
          targetNoteId: 41,
        },
      ],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 2,
      trackedGroups: 0,
      deletedNotes: 2,
      removedMarkers: 2,
      removedCardMarkers: 2,
      removedGroupMarkers: 0,
      deletedLocalRecords: 2,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([[41, 42]]);
    expect(vaultGateway.getFileContent(filePath)).toBe([
      "#### Prompt",
      "Answer",
      "",
      "#### Prompt 2",
      "Answer 2",
    ].join("\n"));
    expect(stateRepository.savedState?.files[filePath]).toBeUndefined();
    expect(stateRepository.savedState?.cards["41"]).toBeUndefined();
    expect(stateRepository.savedState?.cards["42"]).toBeUndefined();
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([]);

    const manualSyncService = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 2000);
    const syncResult = await manualSyncService.syncFile(filePath, settings);

    expect(syncResult.created).toBe(2);
    expect(ankiGateway.addedNotes).toHaveLength(2);
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 9001-->");
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 9002-->");
  });

  it("returns an empty result when the file has no tracked synced cards", async () => {
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const vaultGateway = new FakeManualSyncVaultGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    await expect(useCase.hasTrackedCards("notes/missing.md")).resolves.toBe(false);

    const result = await useCase.execute("notes/missing.md");

    expect(result).toEqual({
      trackedCards: 0,
      trackedGroups: 0,
      deletedNotes: 0,
      removedMarkers: 0,
      removedCardMarkers: 0,
      removedGroupMarkers: 0,
      deletedLocalRecords: 0,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([]);
  });

  it("clears semantic QA child cards and allows a later sync to recreate them", async () => {
    const settings = createSemanticQaSettings();
    const filePath = "notes/semantic.md";
    const content = [
      "#### Concepts #anki-list-qa",
      "- Alpha",
      "  First answer",
      "  <!--ID: 41-->",
      "- Beta",
      "  Second answer",
      "  <!--ID: 42-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, { noteIds: [41, 42] }),
      },
      cards: {
        "41": createStoredSyncedCard(settings, {
          noteId: 41,
          filePath,
          cardType: "semantic-qa",
          heading: "Concepts<br>Alpha",
          backlinkHeadingText: "Concepts #anki-list-qa",
          bodyMarkdown: "First answer",
          rawBlockText: ["semantic-qa:Concepts::1", "Concepts", "Alpha", "First answer"].join("\n"),
          bodyStartLine: 3,
          contentEndLine: 3,
          blockEndLine: 4,
          markerLine: 4,
        }),
        "42": createStoredSyncedCard(settings, {
          noteId: 42,
          filePath,
          cardType: "semantic-qa",
          heading: "Concepts<br>Beta",
          backlinkHeadingText: "Concepts #anki-list-qa",
          bodyMarkdown: "Second answer",
          rawBlockText: ["semantic-qa:Concepts::2", "Concepts", "Beta", "Second answer"].join("\n"),
          blockStartLine: 5,
          bodyStartLine: 6,
          contentEndLine: 6,
          blockEndLine: 7,
          markerLine: 7,
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    await expect(useCase.hasTrackedCards(filePath)).resolves.toBe(true);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 2,
      trackedGroups: 0,
      deletedNotes: 2,
      removedMarkers: 2,
      removedCardMarkers: 2,
      removedGroupMarkers: 0,
      deletedLocalRecords: 2,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([[41, 42]]);
    expect(vaultGateway.getFileContent(filePath)).toBe([
      "#### Concepts #anki-list-qa",
      "- Alpha",
      "  First answer",
      "- Beta",
      "  Second answer",
    ].join("\n"));
    expect(stateRepository.savedState?.files[filePath]).toBeUndefined();
    expect(stateRepository.savedState?.cards["41"]).toBeUndefined();
    expect(stateRepository.savedState?.cards["42"]).toBeUndefined();

    const manualSyncService = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 3000);
    const syncResult = await manualSyncService.syncFile(filePath, settings);

    expect(syncResult.created).toBe(2);
    expect(ankiGateway.addedNotes).toHaveLength(2);
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 9001-->");
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 9002-->");
    expect(vaultGateway.getFileContent(filePath)).not.toContain("<!--ID: 41-->");
    expect(vaultGateway.getFileContent(filePath)).not.toContain("<!--ID: 42-->");
  });

  it("clears QA Group records and allows a later sync to recreate the GI marker", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/group.md";
    const content = [
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "- Beta",
      "  - Second answer",
      "<!--GI:n=42;i=item_a:1,item_b:2;f=3,4,5,6,7,8,9,10,11,12-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, { groupIds: ["group-1"] }),
      },
      cards: {},
      groupBlocks: {
        "group-1": createStoredGroupBlockState({
          noteId: 42,
          groupId: "group-1",
          filePath,
          markerLine: 6,
          blockEndLine: 6,
          contentEndLine: 5,
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    await expect(useCase.hasTrackedCards(filePath)).resolves.toBe(true);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 0,
      trackedGroups: 1,
      deletedNotes: 1,
      removedMarkers: 1,
      removedCardMarkers: 0,
      removedGroupMarkers: 1,
      deletedLocalRecords: 1,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([[42]]);
    expect(vaultGateway.getFileContent(filePath)).toBe([
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "- Beta",
      "  - Second answer",
    ].join("\n"));
    expect(stateRepository.savedState?.files[filePath]).toBeUndefined();
    expect(stateRepository.savedState?.groupBlocks?.["group-1"]).toBeUndefined();

    const manualSyncService = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, () => 3000);
    const syncResult = await manualSyncService.syncFile(filePath, settings);

    expect(syncResult.created).toBe(1);
    expect(syncResult.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(vaultGateway.getFileContent(filePath)).toMatch(/<!--GI:n=9001;i=[^;]+;f=3,4,5,6,7,8,9,10,11,12-->/);
    expect(vaultGateway.getFileContent(filePath)).not.toContain("<!--GI:n=42;");
  });

  it("clears mixed card and group routes in one pass", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/mixed.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 41-->",
      "",
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, {
          noteIds: [41],
          groupIds: ["group-1"],
        }),
      },
      cards: {
        "41": createStoredSyncedCard(settings, {
          noteId: 41,
          filePath,
          markerLine: 3,
          blockEndLine: 4,
        }),
      },
      groupBlocks: {
        "group-1": createStoredGroupBlockState({
          noteId: 42,
          groupId: "group-1",
          filePath,
          blockStartLine: 5,
          bodyStartLine: 6,
          contentEndLine: 7,
          blockEndLine: 8,
          markerLine: 8,
        }),
      },
      pendingWriteBack: [],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 1,
      trackedGroups: 1,
      deletedNotes: 2,
      removedMarkers: 2,
      removedCardMarkers: 1,
      removedGroupMarkers: 1,
      deletedLocalRecords: 2,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([[41, 42]]);
    expect(vaultGateway.getFileContent(filePath)).toBe([
      "#### Prompt",
      "Answer",
      "",
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
    ].join("\n"));
    expect(stateRepository.savedState?.cards["41"]).toBeUndefined();
    expect(stateRepository.savedState?.groupBlocks?.["group-1"]).toBeUndefined();
  });

  it("reports marker write conflicts for QA Group clears but still removes local state so a later sync can recreate the note", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/group-conflict.md";
    const content = [
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    vaultGateway.conflictPaths.add(filePath);
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, { groupIds: ["group-1"] }),
      },
      cards: {},
      groupBlocks: {
        "group-1": createStoredGroupBlockState({
          noteId: 42,
          groupId: "group-1",
          filePath,
          contentEndLine: 3,
          blockEndLine: 4,
          markerLine: 4,
        }),
      },
      pendingWriteBack: [
        createPendingWriteBack(filePath, hashString(content), 42, {
          blockStartLine: 1,
          targetMarker: "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
          markerKind: "group-gi",
          targetGroupId: "group-1",
        }),
      ],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 0,
      trackedGroups: 1,
      deletedNotes: 1,
      removedMarkers: 0,
      removedCardMarkers: 0,
      removedGroupMarkers: 0,
      deletedLocalRecords: 1,
      conflictFiles: [filePath],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([[42]]);
    expect(stateRepository.savedState?.files[filePath]).toBeUndefined();
    expect(stateRepository.savedState?.groupBlocks?.["group-1"]).toBeUndefined();
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([]);
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--GI:n=42;");

    vaultGateway.conflictPaths.delete(filePath);
    const manualSyncService = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, () => 3000);
    const syncResult = await manualSyncService.syncFile(filePath, settings);

    expect(syncResult.created).toBe(1);
    expect(syncResult.rewrittenMarkers).toBe(1);
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--GI:n=9001;");
    expect(vaultGateway.getFileContent(filePath)).not.toContain("<!--GI:n=42;");
  });

  it("clears all pending write-back entries for the current file regardless of marker kind", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/pending.md";
    const otherFilePath = "notes/other.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 41-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
      [otherFilePath]: ["#### Other", "Body", "<!--ID: 77-->"] .join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository({
      files: {
        [filePath]: createStoredFileState(settings, filePath, content, { noteIds: [41] }),
      },
      cards: {
        "41": createStoredSyncedCard(settings, {
          noteId: 41,
          filePath,
          markerLine: 3,
        }),
      },
      groupBlocks: {},
      pendingWriteBack: [
        createPendingWriteBack(filePath, hashString(content), 41, {
          blockStartLine: 1,
          targetMarker: "<!--ID: 41-->",
          markerKind: "card-id",
        }),
        createPendingWriteBack(filePath, hashString(content), 99, {
          blockStartLine: 5,
          targetMarker: "<!--GI:n=99;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
          markerKind: "group-gi",
          targetGroupId: "group-stale",
        }),
        createPendingWriteBack(otherFilePath, hashString(["#### Other", "Body"].join("\n")), 77, {
          blockStartLine: 1,
          targetMarker: "<!--ID: 77-->",
          markerKind: "card-id",
        }),
      ],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    const result = await useCase.execute(filePath);

    expect(result).toMatchObject({
      trackedCards: 1,
      trackedGroups: 0,
      deletedNotes: 1,
      removedMarkers: 1,
      removedCardMarkers: 1,
      removedGroupMarkers: 0,
      deletedLocalRecords: 1,
    });
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([
      createPendingWriteBack(otherFilePath, hashString(["#### Other", "Body"].join("\n")), 77, {
        blockStartLine: 1,
        targetMarker: "<!--ID: 77-->",
        markerKind: "card-id",
      }),
    ]);
  });
});

function createSemanticQaSettings(): PluginSettings {
  const base = createModule3Settings();

  return {
    ...base,
    noteFieldMappings: {
      ...base.noteFieldMappings,
      [createNoteFieldMappingKey("semantic-qa", base.semanticQaNoteType)]: {
        cardType: "semantic-qa",
        modelName: base.semanticQaNoteType,
        loadedFieldNames: ["Front", "Back"],
        titleField: "Front",
        bodyField: "Back",
        loadedAt: 1,
      },
    },
  };
}

function createStoredFileState(
  settings: PluginSettings,
  filePath: string,
  content: string,
  overrides: Partial<FileState> = {},
): FileState {
  return {
    filePath,
    fileHash: overrides.fileHash ?? hashString(content),
    fileStamp: overrides.fileStamp ?? `1:${content.length}`,
    deckRulesFingerprint: overrides.deckRulesFingerprint ?? createDeckRulesFingerprint(settings),
    lastIndexedAt: overrides.lastIndexedAt ?? 1,
    noteIds: overrides.noteIds ?? [],
    groupIds: overrides.groupIds,
  };
}

function createStoredGroupBlockState(overrides: Partial<GroupBlockState> = {}): GroupBlockState {
  return {
    groupId: overrides.groupId ?? "group-1",
    noteId: overrides.noteId ?? 42,
    filePath: overrides.filePath ?? "notes/example.md",
    headingText: overrides.headingText ?? "Concepts #anki-list",
    backlinkHeadingText: overrides.backlinkHeadingText ?? "Concepts #anki-list",
    headingLevel: overrides.headingLevel ?? 4,
    stem: overrides.stem ?? "Concepts",
    src: overrides.src ?? buildGroupSrc(overrides.filePath ?? "notes/example.md", overrides.backlinkHeadingText ?? "Concepts #anki-list"),
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 0,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 5,
    contentEndLine: overrides.contentEndLine ?? 5,
    markerLine: overrides.markerLine,
    markerIndent: overrides.markerIndent,
    rawBlockText: overrides.rawBlockText ?? "qa-group:Concepts",
    rawBlockHash: overrides.rawBlockHash ?? hashString(overrides.rawBlockText ?? "qa-group:Concepts"),
    deck: overrides.deck ?? "notes",
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    items: overrides.items ?? [
      { itemId: "item-a", title: "Alpha", answer: "First answer", slot: 1, ordinalInMarkdown: 1 },
    ],
    freeSlots: overrides.freeSlots ?? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    lastSyncedAt: overrides.lastSyncedAt ?? 1,
    orphan: overrides.orphan ?? false,
  };
}

function createPendingWriteBack(
  filePath: string,
  expectedFileHash: string,
  targetNoteId: number,
  overrides: Partial<PendingWriteBackState> = {},
): PendingWriteBackState {
  return {
    filePath,
    blockStartLine: overrides.blockStartLine ?? 1,
    expectedFileHash,
    targetMarker: overrides.targetMarker ?? `<!--ID: ${targetNoteId}-->`,
    rawBlockHash: overrides.rawBlockHash ?? hashString(`${filePath}:${targetNoteId}:${overrides.blockStartLine ?? 1}`),
    targetNoteId,
    markerKind: overrides.markerKind,
    targetGroupId: overrides.targetGroupId,
  };
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
    heading,
    backlinkHeadingText: overrides.backlinkHeadingText ?? heading,
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown,
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? rawBlockText.length,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 3,
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