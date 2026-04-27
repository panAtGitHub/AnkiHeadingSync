import { describe, expect, it } from "vitest";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createEmptyPluginState, type PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { DataJsonPluginStateRepository } from "./DataJsonPluginStateRepository";
import type { PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

class InMemoryPluginDataStore implements PluginDataStore<PluginDataSnapshot> {
  constructor(private snapshot: PluginDataSnapshot | null = null) {}

  async load(): Promise<PluginDataSnapshot | null> {
    return this.snapshot;
  }

  async save(data: PluginDataSnapshot): Promise<void> {
    this.snapshot = data;
  }
}

describe("DataJsonPluginStateRepository", () => {
  it("loads an empty plugin state when none has been saved", async () => {
    const repository = new DataJsonPluginStateRepository(new InMemoryPluginDataStore());

    await expect(repository.load()).resolves.toEqual(createEmptyPluginState());
  });

  it("persists pluginState independently from settings", async () => {
    const store = new InMemoryPluginDataStore({
      settings: {
        defaultDeck: "Deck",
      },
    });
    const repository = new DataJsonPluginStateRepository(store);

    await repository.save({
      files: {
        "notes/example.md": {
          filePath: "notes/example.md",
          fileHash: "hash",
          fileStamp: "1:1",
          lastIndexedAt: 1,
          noteIds: [41],
        },
      },
      cards: {},
      pendingWriteBack: [],
    });

    const snapshot = await store.load();
    expect(snapshot?.pluginState?.files["notes/example.md"]?.noteIds).toEqual([41]);
    expect(snapshot?.settings?.defaultDeck).toBe("Deck");
  });

  it("migrates legacy cardId-keyed plugin state to noteId-keyed state on load", async () => {
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const legacyPluginState = {
      files: {
        "notes/example.md": {
          filePath: "notes/example.md",
          fileHash: "hash",
          fileStamp: "1:1",
          lastIndexedAt: 1,
          cardIds: ["ahs_1"],
        },
      },
      cards: {
        ahs_1: {
          cardId: "ahs_1",
          noteId: 41,
          filePath: "notes/example.md",
          heading: "Prompt",
          backlinkHeadingText: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Answer",
          cardType: "basic",
          blockStartOffset: 0,
          blockEndOffset: rawBlockText.length,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText,
          rawBlockHash: hashString(rawBlockText),
          renderConfigHash: "render-hash",
          deck: "notes",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [
        {
          filePath: "notes/example.md",
          cardId: "ahs_1",
          noteId: 41,
          expectedFileHash: "hash",
          targetMarker: "<!-- AHS:card=ahs_1 note=41 -->",
          rawBlockHash: hashString(rawBlockText),
        },
      ],
    };
    const repository = new DataJsonPluginStateRepository(new InMemoryPluginDataStore({
      pluginState: legacyPluginState as unknown as PluginDataSnapshot["pluginState"],
    }));

    const loaded = await repository.load();

    expect(loaded.files["notes/example.md"]?.noteIds).toEqual([41]);
    expect(Object.keys(loaded.cards)).toEqual(["41"]);
    expect(loaded.cards["41"]?.noteId).toBe(41);
    expect(loaded.cards["41"]?.backlinkHeadingText).toBe("Prompt");
    expect(loaded.pendingWriteBack).toEqual([]);
  });

  it("preserves valid modern pending writeback entries across save and load", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonPluginStateRepository(store);
    const pendingWriteBack: PendingWriteBackState[] = [
      createPendingWriteBackState({
        filePath: "notes/card.md",
        blockStartLine: 2,
        expectedFileHash: "hash-card",
        targetMarker: "<!--ID: 41-->",
        rawBlockHash: "raw-card",
        targetNoteId: 41,
        markerKind: "card-id",
      }),
      createPendingWriteBackState({
        filePath: "notes/group.md",
        blockStartLine: 6,
        expectedFileHash: "hash-group",
        targetMarker: "<!--GI:n=42;i=item_a:1;f=2,3,4-->",
        rawBlockHash: "raw-group",
        targetNoteId: 42,
        markerKind: "group-gi",
        targetGroupId: "group-1",
      }),
      createPendingWriteBackState({
        filePath: "notes/legacy-shape-but-modern-fields.md",
        blockStartLine: 9,
        expectedFileHash: "hash-no-kind",
        targetMarker: "<!--ID: 43-->",
        rawBlockHash: "raw-no-kind",
        targetNoteId: 43,
      }),
    ];

    await repository.save({
      files: {},
      cards: {},
      pendingWriteBack,
    });

    await expect(repository.load()).resolves.toMatchObject({
      pendingWriteBack,
    });
  });

  it("drops malformed and legacy pending writeback entries during load", async () => {
    const repository = new DataJsonPluginStateRepository(new InMemoryPluginDataStore({
      pluginState: {
        files: {},
        cards: {},
        pendingWriteBack: [
          {
            filePath: "notes/missing-note-id.md",
            blockStartLine: 1,
            expectedFileHash: "hash",
            targetMarker: "<!--ID: 1-->",
            rawBlockHash: "raw",
          },
          {
            filePath: "notes/wrong-line.md",
            blockStartLine: "1" as never,
            expectedFileHash: "hash",
            targetMarker: "<!--ID: 2-->",
            rawBlockHash: "raw",
            targetNoteId: 2,
          },
          {
            filePath: "notes/invalid-kind.md",
            blockStartLine: 1,
            expectedFileHash: "hash",
            targetMarker: "<!--ID: 3-->",
            rawBlockHash: "raw",
            targetNoteId: 3,
            markerKind: "other" as never,
          },
          {
            filePath: "notes/invalid-group-id.md",
            blockStartLine: 1,
            expectedFileHash: "hash",
            targetMarker: "<!--GI:n=4;i=item_a:1;f=2-->",
            rawBlockHash: "raw",
            targetNoteId: 4,
            markerKind: "group-gi",
            targetGroupId: "",
          },
          {
            filePath: "notes/legacy-only.md",
            cardId: "ahs_1",
            noteId: 5,
            expectedFileHash: "hash",
            targetMarker: "<!--AHS:card=ahs_1 note=5-->",
            rawBlockHash: "raw",
          },
          {
            filePath: "notes/missing-hash.md",
            blockStartLine: 1,
            expectedFileHash: "",
            targetMarker: "<!--ID: 6-->",
            rawBlockHash: "raw",
            targetNoteId: 6,
          },
        ],
      } as never,
    }));

    await expect(repository.load()).resolves.toMatchObject({
      pendingWriteBack: [],
    });
  });

  it("drops removed semantic QA card state instead of converting it to basic", async () => {
    const rawBlockText = ["semantic-qa:核心产品::1", "城市更新", "核心产品", "百人会"].join("\n");
    const repository = new DataJsonPluginStateRepository(new InMemoryPluginDataStore({
      pluginState: {
        files: {
          "notes/example.md": {
            filePath: "notes/example.md",
            fileHash: "hash",
            fileStamp: "1:1",
            lastIndexedAt: 1,
            noteIds: [52],
          },
        },
        cards: {
          "52": {
            noteId: 52,
            filePath: "notes/example.md",
            heading: "城市更新<br>核心产品",
            backlinkHeadingText: "城市更新 #anki-list-qa",
            headingLevel: 4,
            bodyMarkdown: "百人会",
            cardType: "semantic-qa" as never,
            blockStartOffset: 0,
            blockEndOffset: rawBlockText.length,
            blockStartLine: 2,
            bodyStartLine: 3,
            blockEndLine: 3,
            contentEndLine: 3,
            rawBlockText,
            rawBlockHash: hashString(rawBlockText),
            renderConfigHash: "render-hash",
            deck: "notes",
            deckWarnings: [],
            tagsHint: [],
            lastSyncedAt: 1,
            orphan: false,
          },
        },
        pendingWriteBack: [],
      },
    }));

    const loaded = await repository.load();

    expect(loaded.cards["52"]).toBeUndefined();
    expect(loaded.files["notes/example.md"]?.noteIds).toEqual([]);
  });

  it("keeps supported basic and cloze card states while filtering dangling file noteIds", async () => {
    const basicRawBlockText = ["#### Prompt", "Answer"].join("\n");
    const clozeRawBlockText = ["##### Cloze", "{{c1::Body}}"].join("\n");
    const repository = new DataJsonPluginStateRepository(new InMemoryPluginDataStore({
      pluginState: {
        files: {
          "notes/example.md": {
            filePath: "notes/example.md",
            fileHash: "hash",
            fileStamp: "1:1",
            lastIndexedAt: 1,
            noteIds: [41, 42, 99],
          },
        },
        cards: {
          "41": {
            noteId: 41,
            filePath: "notes/example.md",
            heading: "Prompt",
            backlinkHeadingText: "Prompt",
            headingLevel: 4,
            bodyMarkdown: "Answer",
            cardType: "basic",
            blockStartOffset: 0,
            blockEndOffset: basicRawBlockText.length,
            blockStartLine: 1,
            bodyStartLine: 2,
            blockEndLine: 2,
            contentEndLine: 2,
            rawBlockText: basicRawBlockText,
            rawBlockHash: hashString(basicRawBlockText),
            renderConfigHash: "render-basic",
            deck: "notes",
            deckWarnings: [],
            tagsHint: [],
            lastSyncedAt: 1,
            orphan: false,
          },
          "42": {
            noteId: 42,
            filePath: "notes/example.md",
            heading: "Cloze",
            backlinkHeadingText: "Cloze",
            headingLevel: 5,
            bodyMarkdown: "{{c1::Body}}",
            cardType: "cloze",
            blockStartOffset: 0,
            blockEndOffset: clozeRawBlockText.length,
            blockStartLine: 4,
            bodyStartLine: 5,
            blockEndLine: 5,
            contentEndLine: 5,
            rawBlockText: clozeRawBlockText,
            rawBlockHash: hashString(clozeRawBlockText),
            renderConfigHash: "render-cloze",
            deck: "notes",
            deckWarnings: [],
            tagsHint: [],
            lastSyncedAt: 1,
            orphan: false,
          },
        },
        pendingWriteBack: [],
      },
    }));

    const loaded = await repository.load();

    expect(Object.keys(loaded.cards)).toEqual(["41", "42"]);
    expect(loaded.cards["41"]?.cardType).toBe("basic");
    expect(loaded.cards["42"]?.cardType).toBe("cloze");
    expect(loaded.files["notes/example.md"]?.noteIds).toEqual([41, 42]);
  });
});

function createPendingWriteBackState(overrides: Partial<PendingWriteBackState> = {}): PendingWriteBackState {
  return {
    filePath: overrides.filePath ?? "notes/example.md",
    blockStartLine: overrides.blockStartLine ?? 1,
    expectedFileHash: overrides.expectedFileHash ?? "hash",
    targetMarker: overrides.targetMarker ?? "<!--ID: 41-->",
    rawBlockHash: overrides.rawBlockHash ?? "raw-block-hash",
    targetNoteId: overrides.targetNoteId ?? 41,
    markerKind: overrides.markerKind,
    targetGroupId: overrides.targetGroupId,
  };
}