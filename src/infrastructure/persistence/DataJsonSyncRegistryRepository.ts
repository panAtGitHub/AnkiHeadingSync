import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import type { PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";
import { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";

export class DataJsonSyncRegistryRepository implements SyncRegistryRepository {
  constructor(private readonly pluginDataStore: PluginDataStore<PluginDataSnapshot>) {}

  async load(): Promise<SyncRegistry> {
    const snapshot = await this.pluginDataStore.load();
    const records = snapshot?.syncRegistry?.records ?? [];

    return new SyncRegistry(
      records.map((record) => ({
        cardKey: createCardKey(record.cardKey),
        noteId: record.noteId,
        filePath: record.filePath,
        identityMode: record.identityMode ?? "legacy-card-key",
        legacyCardKey: record.legacyCardKey ? createCardKey(record.legacyCardKey) : undefined,
        sourceHash: createContentHash(record.sourceHash),
        lastSyncedAt: record.lastSyncedAt,
        orphan: record.orphan,
      })),
    );
  }

  async save(registry: SyncRegistry): Promise<void> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};

    await this.pluginDataStore.save({
      ...snapshot,
      syncRegistry: {
        records: registry.list().map((record) => ({
          cardKey: record.cardKey,
          noteId: record.noteId,
          filePath: record.filePath,
          identityMode: record.identityMode,
          legacyCardKey: record.legacyCardKey,
          sourceHash: record.sourceHash,
          lastSyncedAt: record.lastSyncedAt,
          orphan: record.orphan,
        })),
      },
    });
  }
}