export interface ClearCurrentFileSyncedCardsResult {
  trackedCards: number;
  trackedGroups: number;
  deletedNotes: number;
  removedMarkers: number;
  removedCardMarkers: number;
  removedGroupMarkers: number;
  deletedLocalRecords: number;
  conflictFiles: string[];
  failureFiles: Array<{ filePath: string; message: string }>;
}

export interface CleanupEmptyDecksResult {
  candidateCount: number;
  selectedCount: number;
  deletedCount: number;
  deletedDeckNames: string[];
  skippedDeckNames: string[];
}