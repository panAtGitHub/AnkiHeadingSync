import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import { createEmptyPluginState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

import type { PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

export class DataJsonPluginStateRepository implements PluginStateRepository {
  constructor(private readonly pluginDataStore: PluginDataStore<PluginDataSnapshot>) {}

  async load(): Promise<PluginState> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};
    return snapshot.pluginState ?? createEmptyPluginState();
  }

  async save(state: PluginState): Promise<void> {
    const snapshot = (await this.pluginDataStore.load()) ?? {};

    await this.pluginDataStore.save({
      ...snapshot,
      pluginState: state,
    });
  }
}