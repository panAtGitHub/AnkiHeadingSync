import { describe, expect, it } from "vitest";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";

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
          cardIds: ["ahs_1"],
        },
      },
      cards: {},
      pendingWriteBack: [],
    });

    const snapshot = await store.load();
    expect(snapshot?.pluginState?.files["notes/example.md"]?.cardIds).toEqual(["ahs_1"]);
    expect(snapshot?.settings?.defaultDeck).toBe("Deck");
  });
});