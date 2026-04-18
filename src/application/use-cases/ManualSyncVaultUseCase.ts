import type { PluginSettings } from "@/application/config/PluginSettings";
import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";
import type { ManualSyncService } from "@/application/services/ManualSyncService";

export class ManualSyncVaultUseCase {
  constructor(private readonly manualSyncService: ManualSyncService) {}

  async execute(settings: PluginSettings): Promise<ManualSyncResult> {
    return this.manualSyncService.syncVault(settings);
  }
}