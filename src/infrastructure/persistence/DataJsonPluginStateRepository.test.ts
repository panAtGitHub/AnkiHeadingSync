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
    expect(loaded.pendingWriteBack).toEqual([]);
  });
});