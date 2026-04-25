import { Notice } from "obsidian";

import { renderPluginFileFailuresInline } from "@/application/errors/PluginUserError";
import type { ClearCurrentFileSyncedCardsResult, CleanupEmptyDecksResult } from "@/application/use-cases/cleanupResetTypes";
import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { formatList, resolvePluginLocale, t, type TranslationKey } from "@/presentation/i18n";

export class NoticeService {
  info(message: string): void {
    new Notice(message, 5000);
  }

  error(message: string): void {
    new Notice(message, 8000);
  }

  showSyncSummary(kind: "currentFile" | "vault", result: ManualSyncResult): void {
    const locale = resolvePluginLocale();
    const summaryKey = kind === "currentFile" ? "notice.summary.currentFileSync" : "notice.summary.vaultSync";
    const summary = t(summaryKey, {
      scannedFiles: result.scannedFiles,
      scannedCards: result.scannedCards,
      created: result.created,
      updated: result.updated,
      migratedNoteTypes: result.migratedNoteTypes,
      migratedDecks: result.migratedDecks,
      orphaned: result.orphaned,
      uploadedMedia: result.uploadedMedia,
      skippedUnchangedCards: result.skippedUnchangedCards,
    });

    const segments = [summary];
    if (result.markerWriteConflictFiles.length > 0) {
      segments.push(t("notice.summary.markerWriteConflicts", {
        files: formatList(locale, result.markerWriteConflictFiles),
      }));
    }
    if (result.warnings.length > 0) {
      segments.push(t("notice.summary.warningsCount", { count: result.warnings.length }));
    }

    this.info(segments.join(" "));
    for (const warning of result.warnings.slice(0, 3)) {
      this.info(this.renderDeckWarning(warning));
    }
  }

  showRebuildSummary(result: ManualSyncResult): void {
    const locale = resolvePluginLocale();
    const segments = [t("notice.summary.rebuild", {
      scannedFiles: result.scannedFiles,
      scannedCards: result.scannedCards,
      migratedDecks: result.migratedDecks,
      orphaned: result.orphaned,
      rewrittenMarkers: result.rewrittenMarkers,
      skippedUnchangedCards: result.skippedUnchangedCards,
    })];

    if (result.markerWriteConflictFiles.length > 0) {
      segments.push(t("notice.summary.markerWriteConflicts", {
        files: formatList(locale, result.markerWriteConflictFiles),
      }));
    }
    if (result.warnings.length > 0) {
      segments.push(t("notice.summary.warningsCount", { count: result.warnings.length }));
    }

    this.info(segments.join(" "));
    for (const warning of result.warnings.slice(0, 3)) {
      this.info(this.renderDeckWarning(warning));
    }
  }

  showClearCurrentFileSummary(result: ClearCurrentFileSyncedCardsResult): void {
    const locale = resolvePluginLocale();
    const segments = [t("notice.summary.clearCurrentFile", {
      trackedCards: result.trackedCards,
      trackedGroups: result.trackedGroups,
      deletedNotes: result.deletedNotes,
      removedMarkers: result.removedMarkers,
      removedCardMarkers: result.removedCardMarkers,
      removedGroupMarkers: result.removedGroupMarkers,
      deletedLocalRecords: result.deletedLocalRecords,
    })];

    if (result.conflictFiles.length > 0) {
      segments.push(t("notice.summary.markerRemovalConflicts", {
        files: formatList(locale, result.conflictFiles),
      }));
    }
    if (result.failureFiles.length > 0) {
      segments.push(t("notice.summary.failures", {
        items: renderPluginFileFailuresInline(result.failureFiles),
      }));
    }

    this.info(segments.join(" "));
  }

  showCleanupEmptyDecksSummary(result: CleanupEmptyDecksResult): void {
    const locale = resolvePluginLocale();
    const segments = [t("notice.summary.cleanupEmptyDecks", {
      candidateCount: result.candidateCount,
      selectedCount: result.selectedCount,
      deletedCount: result.deletedCount,
      skippedCount: result.skippedDeckNames.length,
    })];

    if (result.skippedDeckNames.length > 0) {
      segments.push(t("notice.summary.skippedDecks", {
        decks: formatList(locale, result.skippedDeckNames),
      }));
    }

    this.info(segments.join(" "));
  }

  private renderDeckWarning(warning: DeckResolutionWarning): string {
    return t(getDeckWarningMessageKey(warning.code), warning.params);
  }
}

function getDeckWarningMessageKey(code: DeckResolutionWarning["code"]): TranslationKey {
  switch (code) {
    case "deck_conflict_yaml_body":
      return "warnings.deck.conflictYamlBody";
    case "deck_multiple_body_declarations":
      return "warnings.deck.multipleBodyDeclarations";
    case "deck_invalid_folder_segment":
      return "warnings.deck.invalidFolderSegment";
    case "deck_fallback_default":
      return "warnings.deck.fallbackDefault";
  }
}