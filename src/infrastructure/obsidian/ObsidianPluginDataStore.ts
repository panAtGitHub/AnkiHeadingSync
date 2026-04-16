import type { Plugin } from "obsidian";

import type { PluginDataStore } from "@/application/ports/PluginDataStore";

export class ObsidianPluginDataStore<TData extends object> implements PluginDataStore<TData> {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<TData | null> {
    const data = await this.plugin.loadData();
    return (data as TData | null) ?? null;
  }

  async save(data: TData): Promise<void> {
    await this.plugin.saveData(data);
  }
}