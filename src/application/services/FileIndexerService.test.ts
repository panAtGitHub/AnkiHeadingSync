import { describe, expect, it } from "vitest";

import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";
import { createModule3Settings, FakeManualSyncVaultGateway } from "@/test-support/manualSyncFakes";

import { FileIndexerService } from "./FileIndexerService";

describe("FileIndexerService", () => {
  it("filters by path before reading file content", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "keep/one.md": ["#### One", "Body"].join("\n"),
      "skip/two.md": ["#### Two", "Body"].join("\n"),
    });
    const service = new FileIndexerService(vaultGateway);

    await service.indexVault(
      createModule3Settings({
        scopeMode: "include",
        includeFolders: ["keep"],
      }),
      createEmptyPluginState(),
    );

    expect(vaultGateway.readCalls).toEqual(["keep/one.md"]);
  });

  it("skips unchanged files by file stamp and reuses stored card state", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/one.md": ["#### One", "Body"].join("\n"),
    });
    const service = new FileIndexerService(vaultGateway);
    const state = {
      files: {
        "notes/one.md": {
          filePath: "notes/one.md",
          fileHash: "hash-a",
          fileStamp: `1:${["#### One", "Body"].join("\n").length}`,
          lastIndexedAt: 1,
          cardIds: ["ahs_1"],
        },
      },
      cards: {
        ahs_1: {
          cardId: "ahs_1",
          noteId: 10,
          filePath: "notes/one.md",
          heading: "One",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### One", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Obsidian",
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const result = await service.indexVault(createModule3Settings(), state);

    expect(result.skippedUnchangedFiles).toBe(1);
    expect(result.skippedUnchangedCards).toBe(1);
    expect(vaultGateway.readCalls).toEqual([]);
    expect(result.cards[0]).toMatchObject({ cardId: "ahs_1", noteId: 10 });
  });
});