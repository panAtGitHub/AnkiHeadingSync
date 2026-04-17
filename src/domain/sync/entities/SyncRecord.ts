import type { CardKey } from "../../card/value-objects/CardKey";
import type { ContentHash } from "../../card/value-objects/ContentHash";

export type SyncIdentityMode = "embedded-note-id" | "legacy-card-key" | "pending-note-id-write";

export interface SyncRecord {
  cardKey: CardKey;
  identityMode: SyncIdentityMode;
  legacyCardKey?: CardKey;
  noteId: number;
  filePath: string;
  sourceHash: ContentHash;
  lastSyncedAt: number;
  orphan: boolean;
}