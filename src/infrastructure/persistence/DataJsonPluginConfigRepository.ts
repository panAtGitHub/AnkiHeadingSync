import { mergePluginSettings, normalizePluginSettings, type PluginSettings, validatePluginSettings } from "@/application/config/PluginSettings";
import type { PluginConfigRepository } from "@/application/ports/PluginConfigRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import type { PluginState } from "@/domain/manual-sync/entities/PluginState";

export interface PluginDataSnapshot {
  settings?: Partial<PluginSettings>;
  pluginState?: PluginState;
}

export class DataJsonPluginConfigRepository implements PluginConfigRepository {
  constructor(private readonly pluginDataStore: PluginDataStore<PluginDataSnapshot>) {}

  async load(): Promise<PluginSettings> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};
    const mergedSettings = mergePluginSettings(snapshot.settings);

    validatePluginSettings(mergedSettings);
    return mergedSettings;
  }

  async save(settings: PluginSettings): Promise<void> {
    const normalizedSettings = normalizePluginSettings(settings);
    validatePluginSettings(normalizedSettings);
    const snapshot = (await this.pluginDataStore.load()) ?? {};

    await this.pluginDataStore.save({
      ...snapshot,
      settings: normalizedSettings,
    });
  }
}