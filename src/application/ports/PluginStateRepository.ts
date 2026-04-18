import type { PluginState } from "@/domain/manual-sync/entities/PluginState";

export interface PluginStateRepository {
  load(): Promise<PluginState>;
  save(state: PluginState): Promise<void>;
}