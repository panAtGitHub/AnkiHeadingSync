import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { CardState } from "@/domain/manual-sync/entities/PluginState";

export interface PlannedCard {
  card: IndexedCard;
  noteId?: number;
  deck: string;
  noteModel: string;
  renderConfigHash: string;
}

export interface ManualSyncPlan {
  toCreate: PlannedCard[];
  toUpdate: PlannedCard[];
  toRewriteMarker: PlannedCard[];
  toOrphan: CardState[];
  unchangedCards: number;
}