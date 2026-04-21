import type { PluginFileFailure } from "@/application/errors/PluginUserError";

export interface ClearCurrentFileSyncedCardsResult {
  trackedCards: number;
  trackedGroups: number;
  deletedNotes: number;
  removedMarkers: number;
  removedCardMarkers: number;
  removedGroupMarkers: number;
  deletedLocalRecords: number;
  conflictFiles: string[];
  failureFiles: PluginFileFailure[];
}

export interface CleanupEmptyDecksResult {
  candidateCount: number;
  selectedCount: number;
  deletedCount: number;
  deletedDeckNames: string[];
  skippedDeckNames: string[];
}