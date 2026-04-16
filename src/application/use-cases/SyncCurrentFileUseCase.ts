import type { PluginSettings } from "@/application/config/PluginSettings";

import type { ExecuteSyncPlanUseCase } from "./ExecuteSyncPlanUseCase";
import type { ScanAndPlanSyncUseCase } from "./ScanAndPlanSyncUseCase";
import type { ExecuteSyncPlanResult } from "./types";

export class SyncCurrentFileUseCase {
  constructor(
    private readonly scanAndPlanSyncUseCase: ScanAndPlanSyncUseCase,
    private readonly executeSyncPlanUseCase: ExecuteSyncPlanUseCase,
  ) {}

  async execute(filePath: string, settings: PluginSettings): Promise<ExecuteSyncPlanResult> {
    const scanResult = await this.scanAndPlanSyncUseCase.executeForFile(filePath, settings);
    return this.executeSyncPlanUseCase.execute(scanResult);
  }
}