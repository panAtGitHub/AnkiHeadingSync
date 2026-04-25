import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";

export interface ManualSyncResult {
  scannedFiles: number;
  scannedCards: number;
  created: number;
  updated: number;
  migratedNoteTypes: number;
  migratedDecks: number;
  orphaned: number;
  uploadedMedia: number;
  skippedUnchangedCards: number;
  rewrittenMarkers: number;
  markerWriteConflictFiles: string[];
  warnings: DeckResolutionWarning[];
}