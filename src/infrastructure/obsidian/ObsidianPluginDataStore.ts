import type { Plugin } from "obsidian";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";

export class ObsidianPluginDataStore<TData extends object> implements PluginDataStore<TData> {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<TData | null> {
    const data: unknown = await this.plugin.loadData();
    return data !== null && typeof data === "object" ? data as TData : null;
  }

  async save(data: TData): Promise<void> {
    await this.plugin.saveData(data);
  }
}