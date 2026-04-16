import { describe, expect, it } from "vitest";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";
import { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";

import { DataJsonSyncRegistryRepository } from "./DataJsonSyncRegistryRepository";
import type { PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

class InMemoryPluginDataStore implements PluginDataStore<PluginDataSnapshot> {
  private snapshot: PluginDataSnapshot | null = null;

  async load(): Promise<PluginDataSnapshot | null> {
    return this.snapshot;
  }

  async save(data: PluginDataSnapshot): Promise<void> {
    this.snapshot = data;
  }
}

describe("DataJsonSyncRegistryRepository", () => {
  it("persists and restores sync records", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonSyncRegistryRepository(store);
    const registry = new SyncRegistry([
      {
        cardKey: createCardKey("card-1"),
        noteId: 101,
        filePath: "notes/example.md",
        sourceHash: createContentHash("hash-1"),
        lastSyncedAt: 10,
        orphan: false,
      },
    ]);

    await repository.save(registry);
    const reloaded = await repository.load();

    expect(reloaded.list()).toEqual(registry.list());
  });
});