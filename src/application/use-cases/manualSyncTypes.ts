export interface ManualSyncResult {
  scannedFiles: number;
  scannedCards: number;
  created: number;
  updated: number;
  orphaned: number;
  uploadedMedia: number;
  skippedUnchangedCards: number;
  rewrittenMarkers: number;
  markerWriteConflictFiles: string[];
}