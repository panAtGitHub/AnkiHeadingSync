import { Notice } from "obsidian";

import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

export class NoticeService {
  info(message: string): void {
    new Notice(message, 5000);
  }

  error(message: string): void {
    new Notice(message, 8000);
  }

  showSyncSummary(prefix: string, result: ManualSyncResult): void {
    const summary = `${prefix}: files ${result.scannedFiles}, cards ${result.scannedCards}, created ${result.created}, updated ${result.updated}, orphaned ${result.orphaned}, media ${result.uploadedMedia}, skipped ${result.skippedUnchangedCards}.`;
    const conflicts = result.markerWriteConflictFiles.length > 0
      ? ` Marker write conflicts: ${result.markerWriteConflictFiles.join(", ")}.`
      : "";
    const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.length}.` : "";

    this.info(`${summary}${conflicts}${warnings}`);
    for (const warning of result.warnings.slice(0, 3)) {
      this.info(warning.message);
    }
  }

  showRebuildSummary(prefix: string, result: ManualSyncResult): void {
    const summary = `${prefix}: files ${result.scannedFiles}, cards ${result.scannedCards}, orphaned ${result.orphaned}, rewritten markers ${result.rewrittenMarkers}, skipped ${result.skippedUnchangedCards}.`;
    const conflicts = result.markerWriteConflictFiles.length > 0
      ? ` Marker write conflicts: ${result.markerWriteConflictFiles.join(", ")}.`
      : "";
    const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.length}.` : "";

    this.info(`${summary}${conflicts}${warnings}`);
    for (const warning of result.warnings.slice(0, 3)) {
      this.info(warning.message);
    }
  }
}