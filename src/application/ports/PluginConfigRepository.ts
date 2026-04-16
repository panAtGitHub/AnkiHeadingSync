import type { PluginSettings } from "../config/PluginSettings";

export interface PluginConfigRepository {
  load(): Promise<PluginSettings>;
  save(settings: PluginSettings): Promise<void>;
}