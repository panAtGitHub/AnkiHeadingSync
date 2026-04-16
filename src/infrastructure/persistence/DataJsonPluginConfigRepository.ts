import { DEFAULT_SETTINGS, type PluginSettings, validatePluginSettings } from "@/application/config/PluginSettings";
import type { PluginConfigRepository } from "@/application/ports/PluginConfigRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";

export interface PluginDataSnapshot {
  settings?: Partial<PluginSettings>;
  syncRegistry?: {
    records: Array<{
      cardKey: string;
      filePath: string;
      lastSyncedAt: number;
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