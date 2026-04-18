import { DEFAULT_SETTINGS, type PluginSettings, validatePluginSettings } from "@/application/config/PluginSettings";
import type { PluginConfigRepository } from "@/application/ports/PluginConfigRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import type { PluginState } from "@/domain/manual-sync/entities/PluginState";

export interface PluginDataSnapshot {
  settings?: Partial<PluginSettings>;
  pluginState?: PluginState;
  syncRegistry?: {
    records: Array<{
      cardKey: string;
      filePath: string;
      identityMode?: "embedded-note-id" | "legacy-card-key" | "pending-note-id-write";
      lastSyncedAt: number;
      legacyCardKey?: string;
      noteId: number;
      orphan: boolean;
      sourceHash: string;
    }>;
  };
}

export class DataJsonPluginConfigRepository implements PluginConfigRepository {
  constructor(private readonly pluginDataStore: PluginDataStore<PluginDataSnapshot>) {}

  async load(): Promise<PluginSettings> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};
    const mergedSettings: PluginSettings = {
      ...DEFAULT_SETTINGS,
      ...snapshot.settings,
      noteFieldMappings: snapshot.settings?.noteFieldMappings ?? DEFAULT_SETTINGS.noteFieldMappings,
      includeFolders: snapshot.settings?.includeFolders ?? DEFAULT_SETTINGS.includeFolders,
      excludeFolders: snapshot.settings?.excludeFolders ?? DEFAULT_SETTINGS.excludeFolders,
    };

    validatePluginSettings(mergedSettings);
    return mergedSettings;
  }

  async save(settings: PluginSettings): Promise<void> {
    validatePluginSettings(settings);
    const snapshot = (await this.pluginDataStore.load()) ?? {};

    await this.pluginDataStore.save({
      ...snapshot,
      settings,
    });
  }
}