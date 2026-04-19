import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { CardState } from "@/domain/manual-sync/entities/PluginState";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";

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
  toVerifyDeck: PlannedCard[];
  toChangeDeck: PlannedCard[];
  toRewriteMarker: PlannedCard[];
  toOrphan: CardState[];
  unchangedCards: number;
  warnings: DeckResolutionWarning[];
}