import { describe, expect, it } from "vitest";

import type { PluginSettings } from "@/application/config/PluginSettings";
import { createDeckRulesFingerprint } from "@/application/services/FileIndexerService";
import { ManualSyncService } from "@/application/services/ManualSyncService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { CardState } from "@/domain/manual-sync/entities/PluginState";
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
        [filePath]: {
          filePath,
          fileHash: hashString(content),
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(settings),
          lastIndexedAt: 1,
          noteIds: [41, 42],
        },
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
      deletedNotes: 2,
      removedMarkers: 2,
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

    const result = await useCase.execute("notes/missing.md");

    expect(result).toEqual({
      trackedCards: 0,
      deletedNotes: 0,
      removedMarkers: 0,
      deletedLocalRecords: 0,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(ankiGateway.deletedNotes).toEqual([]);
  });

  it("reports marker write conflicts, clears file state, and keeps sanitized local cards so a later sync can recreate them", async () => {
    const settings = createModule3Settings();
    const filePath = "notes/conflict.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 42-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    vaultGateway.conflictPaths.add(filePath);
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
        "42": createStoredSyncedCard(settings, {
          noteId: 42,
          filePath,
          markerLine: 3,
        }),
      },
      pendingWriteBack: [
        {
          filePath,
          blockStartLine: 1,
          expectedFileHash: hashString(content),
          targetMarker: "<!--ID: 42-->",
          rawBlockHash: hashString(["#### Prompt", "Answer"].join("\n")),
          targetNoteId: 42,
        },
      ],
    });
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const useCase = new ClearCurrentFileSyncedCardsUseCase(stateRepository, ankiGateway, vaultGateway);

    const result = await useCase.execute(filePath);

    expect(result.deletedNotes).toBe(1);
    expect(result.removedMarkers).toBe(0);
  expect(result.deletedLocalRecords).toBe(1);
    expect(result.conflictFiles).toEqual([filePath]);
    expect(ankiGateway.deletedNotes).toEqual([[42]]);
    expect(stateRepository.savedState?.files[filePath]).toBeUndefined();
  expect(stateRepository.savedState?.cards["42"]).toBeUndefined();
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([]);
  expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 42-->");

    vaultGateway.conflictPaths.delete(filePath);
    const manualSyncService = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 3000);
    const syncResult = await manualSyncService.syncFile(filePath, settings);

    expect(syncResult.created).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(1);
    expect(vaultGateway.getFileContent(filePath)).toContain("<!--ID: 9001-->");
    expect(vaultGateway.getFileContent(filePath)).not.toContain("<!--ID: 42-->");
  });
});

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