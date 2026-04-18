import { describe, expect, it } from "vitest";

import type { PluginSettings } from "@/application/config/PluginSettings";
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
    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("note=");
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
    tagsHint: indexedCard.tagsHint,
    lastSyncedAt: overrides.lastSyncedAt ?? 1,
    orphan: overrides.orphan ?? false,
  };
}