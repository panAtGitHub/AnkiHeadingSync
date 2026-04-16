import type { CardKey } from "../../card/value-objects/CardKey";
import type { ContentHash } from "../../card/value-objects/ContentHash";

export interface SyncRecord {
  cardKey: CardKey;
  noteId: number;
  filePath: string;
  sourceHash: ContentHash;
  lastSyncedAt: number;
  orphan: boolean;
}