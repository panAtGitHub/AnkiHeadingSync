import type { PluginSettings } from "@/application/config/PluginSettings";
import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";
import type { ManualSyncService } from "@/application/services/ManualSyncService";

export class ManualSyncCurrentFileUseCase {
  constructor(private readonly manualSyncService: ManualSyncService) {}

  async execute(filePath: string, settings: PluginSettings): Promise<ManualSyncResult> {
    return this.manualSyncService.syncFile(filePath, settings);
  }
}