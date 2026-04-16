import { Notice } from "obsidian";

import type { ExecuteSyncPlanResult } from "@/application/use-cases/types";

export class NoticeService {
  info(message: string): void {
    new Notice(message, 5000);
  }

  error(message: string): void {
    new Notice(message, 8000);
  }

  showSyncSummary(prefix: string, result: ExecuteSyncPlanResult): void {
    this.info(
      `${prefix}: scanned ${result.scanned}, created ${result.created}, updated ${result.updated}, orphaned ${result.markedOrphan}, media ${result.uploadedMedia}.`,
    );
  }
}