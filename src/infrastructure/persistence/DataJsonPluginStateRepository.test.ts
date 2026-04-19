import { describe, expect, it } from "vitest";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";
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

  it("preserves semantic QA card type when loading modern plugin state", async () => {
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
            cardType: "semantic-qa",
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

    expect(loaded.cards["52"]?.cardType).toBe("semantic-qa");
    expect(loaded.cards["52"]?.backlinkHeadingText).toBe("城市更新 #anki-list-qa");
  });
});