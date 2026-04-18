import { Notice } from "obsidian";

import type { ClearCurrentFileSyncedCardsResult, CleanupEmptyDecksResult } from "@/application/use-cases/cleanupResetTypes";
import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

export class NoticeService {
  info(message: string): void {
    new Notice(message, 5000);
  }

  error(message: string): void {
    new Notice(message, 8000);
  }

  showSyncSummary(prefix: string, result: ManualSyncResult): void {
    const summary = `${prefix}: files ${result.scannedFiles}, cards ${result.scannedCards}, created ${result.created}, updated ${result.updated}, migrated decks ${result.migratedDecks}, orphaned ${result.orphaned}, media ${result.uploadedMedia}, skipped ${result.skippedUnchangedCards}.`;
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
    const summary = `${prefix}: files ${result.scannedFiles}, cards ${result.scannedCards}, migrated decks ${result.migratedDecks}, orphaned ${result.orphaned}, rewritten markers ${result.rewrittenMarkers}, skipped ${result.skippedUnchangedCards}.`;
    const conflicts = result.markerWriteConflictFiles.length > 0
      ? ` Marker write conflicts: ${result.markerWriteConflictFiles.join(", ")}.`
      : "";
    const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.length}.` : "";

    this.info(`${summary}${conflicts}${warnings}`);
    for (const warning of result.warnings.slice(0, 3)) {
      this.info(warning.message);
    }
  }

  showClearCurrentFileSummary(prefix: string, result: ClearCurrentFileSyncedCardsResult): void {
    const summary = `${prefix}: tracked ${result.trackedCards}, deleted notes ${result.deletedNotes}, removed markers ${result.removedMarkers}, deleted local records ${result.deletedLocalRecords}.`;
    const conflicts = result.conflictFiles.length > 0
      ? ` Marker removal conflicts: ${result.conflictFiles.join(", ")}.`
      : "";
    const failures = result.failureFiles.length > 0
      ? ` Failures: ${result.failureFiles.map((entry) => `${entry.filePath} (${entry.message})`).join(", ")}.`
      : "";

    this.info(`${summary}${conflicts}${failures}`);
  }

  showCleanupEmptyDecksSummary(prefix: string, result: CleanupEmptyDecksResult): void {
    const summary = `${prefix}: candidates ${result.candidateCount}, selected ${result.selectedCount}, deleted ${result.deletedCount}, skipped ${result.skippedDeckNames.length}.`;
    const skipped = result.skippedDeckNames.length > 0
      ? ` Skipped decks: ${result.skippedDeckNames.join(", ")}.`
      : "";

    this.info(`${summary}${skipped}`);
  }
}