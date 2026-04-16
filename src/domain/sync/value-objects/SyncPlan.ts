import type { Card } from "../../card/entities/Card";
import type { DeckName } from "../../card/value-objects/DeckName";
import type { SyncRecord } from "../entities/SyncRecord";

export interface SyncPlanUpdate {
  card: Card;
  noteId: number;
}

export interface SyncPlan {
  toCreateDecks: DeckName[];
  toAdd: Card[];
  toUpdate: SyncPlanUpdate[];
  toMarkOrphan: SyncRecord[];
}