import { describe, expect, it } from "vitest";

import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";
import { createModule3Settings, FakeManualSyncVaultGateway } from "@/test-support/manualSyncFakes";

import { createDeckRulesFingerprint, FileIndexerService } from "./FileIndexerService";

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
          deckRulesFingerprint: createDeckRulesFingerprint(createIndexSettingsForPath("notes/one.md")),
          lastIndexedAt: 1,
          noteIds: [10],
        },
      },
      cards: {
        "10": {
          noteId: 10,
          filePath: "notes/one.md",
          heading: "One",
          backlinkHeadingText: "One",
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
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const result = await service.indexVault(createIndexSettingsForPath("notes/one.md"), state);

    expect(result.skippedUnchangedFiles).toBe(1);
    expect(result.skippedUnchangedCards).toBe(1);
    expect(vaultGateway.readCalls).toEqual([]);
    expect(result.cards[0]).toMatchObject({ noteId: 10, noteIdSource: "marker", idMarkerState: "present-valid" });
  });

  it("re-reads unchanged files when cached cloze state missed an all-cloze marker", async () => {
    const content = [
      "#### Cloze #anki-cloze-all",
      "{A} {B} {C}",
      "<!--ID: 10-->",
    ].join("\n");
    const settings = createIndexSettingsForPath("notes/one.md");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/one.md": content,
    });
    const service = new FileIndexerService(vaultGateway);
    const state = {
      files: {
        "notes/one.md": {
          filePath: "notes/one.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(settings),
          lastIndexedAt: 1,
          noteIds: [10],
        },
      },
      cards: {
        "10": {
          noteId: 10,
          filePath: "notes/one.md",
          heading: "Cloze #anki-cloze-all",
          backlinkHeadingText: "Cloze #anki-cloze-all",
          headingLevel: 4,
          bodyMarkdown: "{A} {B} {C}",
          cardType: "cloze" as const,
          clozeMode: "sequential" as const,
          blockStartOffset: 0,
          blockEndOffset: content.length,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 3,
          contentEndLine: 2,
          markerLine: 3,
          rawBlockText: content,
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Obsidian",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const result = await service.indexVault(settings, state);

    expect(result.skippedUnchangedFiles).toBe(0);
    expect(vaultGateway.readCalls).toEqual(["notes/one.md"]);
    expect(result.cards[0]).toMatchObject({
      noteId: 10,
      cardType: "cloze",
      clozeMode: "all",
    });
  });

  it("forces re-read when deck rules fingerprint changed even if file stamp is unchanged", async () => {
    const content = ["#### One", "Body"].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/one.md": content,
    });
    const service = new FileIndexerService(vaultGateway);
    const state = {
      files: {
        "notes/one.md": {
          filePath: "notes/one.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(createIndexSettingsForPath("notes/one.md", { defaultDeck: "Old::Deck" })),
          lastIndexedAt: 1,
          noteIds: [10],
        },
      },
      cards: {
        "10": {
          noteId: 10,
          filePath: "notes/one.md",
          heading: "One",
          backlinkHeadingText: "One",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: content,
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Old::Deck",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const result = await service.indexVault(createIndexSettingsForPath("notes/one.md", { defaultDeck: "New::Deck" }), state);

    expect(result.skippedUnchangedFiles).toBe(0);
    expect(vaultGateway.readCalls).toEqual(["notes/one.md"]);
  });

  it("changes the fingerprint and forces re-read when card answer cutoff mode changed", async () => {
    const content = ["#### One", "Body"].join("\n");
    const oldSettings = createIndexSettingsForPath("notes/one.md", { cardAnswerCutoffMode: "heading-block" });
    const newSettings = createIndexSettingsForPath("notes/one.md", { cardAnswerCutoffMode: "double-blank-lines" });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/one.md": content,
    });
    const service = new FileIndexerService(vaultGateway);
    const state = {
      files: {
        "notes/one.md": {
          filePath: "notes/one.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [10],
        },
      },
      cards: {
        "10": {
          noteId: 10,
          filePath: "notes/one.md",
          heading: "One",
          backlinkHeadingText: "One",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: content,
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Obsidian",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    expect(createDeckRulesFingerprint(oldSettings)).not.toBe(createDeckRulesFingerprint(newSettings));

    const result = await service.indexVault(newSettings, state);

    expect(result.skippedUnchangedFiles).toBe(0);
    expect(vaultGateway.readCalls).toEqual(["notes/one.md"]);
  });

  it("changes the fingerprint and forces re-read when pure tag line cleanup setting changed", async () => {
    const content = ["#### One", "#项目A #重点/案例", "", "Body"].join("\n");
    const oldSettings = createIndexSettingsForPath("notes/one.md", { keepPureTagLinesInCardBody: true });
    const newSettings = createIndexSettingsForPath("notes/one.md", { keepPureTagLinesInCardBody: false });
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/one.md": content,
    });
    const service = new FileIndexerService(vaultGateway);
    const state = {
      files: {
        "notes/one.md": {
          filePath: "notes/one.md",
          fileHash: "hash-a",
          fileStamp: `1:${content.length}`,
          deckRulesFingerprint: createDeckRulesFingerprint(oldSettings),
          lastIndexedAt: 1,
          noteIds: [10],
        },
      },
      cards: {
        "10": {
          noteId: 10,
          filePath: "notes/one.md",
          heading: "One",
          backlinkHeadingText: "One",
          headingLevel: 4,
          bodyMarkdown: "#项目A #重点/案例\n\nBody",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 4,
          contentEndLine: 4,
          rawBlockText: content,
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Obsidian",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    expect(createDeckRulesFingerprint(oldSettings)).not.toBe(createDeckRulesFingerprint(newSettings));

    const result = await service.indexVault(newSettings, state);

    expect(result.skippedUnchangedFiles).toBe(0);
    expect(vaultGateway.readCalls).toEqual(["notes/one.md"]);
  });
});

function createIndexSettingsForPath(filePath: string, overrides: Parameters<typeof createModule3Settings>[0] = {}) {
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
