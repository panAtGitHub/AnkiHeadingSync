import type { PluginSettings } from "@/application/config/PluginSettings";

import type { ExecuteSyncPlanUseCase } from "./ExecuteSyncPlanUseCase";
import type { ScanAndPlanSyncUseCase } from "./ScanAndPlanSyncUseCase";
import type { ExecuteSyncPlanResult } from "./types";

export class SyncVaultUseCase {
  constructor(
    private readonly scanAndPlanSyncUseCase: ScanAndPlanSyncUseCase,
    private readonly executeSyncPlanUseCase: ExecuteSyncPlanUseCase,
  ) {}

  async execute(settings: PluginSettings): Promise<ExecuteSyncPlanResult> {
    const scanResult = await this.scanAndPlanSyncUseCase.executeForVault(settings);
    return this.executeSyncPlanUseCase.execute(scanResult);
  }
}