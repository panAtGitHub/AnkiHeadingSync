import type { PluginSettings } from "@/application/config/PluginSettings";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { PluginState } from "@/domain/manual-sync/entities/PluginState";
import { getDeckResolutionWarningKey, type DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import type { ManualSyncPlan, PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";

export class DiffPlannerService {
  constructor(private readonly renderConfigService = new RenderConfigService()) {}

  plan(cards: IndexedCard[], state: PluginState, scopedFilePaths: string[], settings: PluginSettings): ManualSyncPlan {
    const cardsById = new Map<string, IndexedCard>();
    const pendingByCardId = new Map(state.pendingWriteBack.map((pending) => [pending.cardId, pending]));
    const toCreate: PlannedCard[] = [];
    const toUpdate: PlannedCard[] = [];
    const toRewriteMarker: PlannedCard[] = [];
    const warningMap = new Map<string, DeckResolutionWarning>();
    let unchangedCards = 0;

    for (const card of cards) {
      if (cardsById.has(card.cardId)) {
        throw new Error(`Duplicate cardId detected in current scan: ${card.cardId}`);
      }

      cardsById.set(card.cardId, card);
      const existingState = state.cards[card.cardId];
      const renderPlan = this.renderConfigService.resolve(card, settings, existingState?.deck ? [existingState.deck] : []);
      for (const warning of renderPlan.warnings) {
        warningMap.set(getDeckResolutionWarningKey(warning), warning);
      }
      const resolvedNoteId = existingState?.noteId ?? card.noteId;
      const plannedCard: PlannedCard = {
        card: {
          ...card,
          noteId: resolvedNoteId,
        },
        noteId: resolvedNoteId,
        deck: renderPlan.deck,
        noteModel: renderPlan.noteModel,
        renderConfigHash: renderPlan.renderConfigHash,
      };

      if (!resolvedNoteId) {
        toCreate.push(plannedCard);
        continue;
      }

      if (
        card.markerState === "missing" ||
        card.markerState === "card-only" ||
        card.markerNoteId !== resolvedNoteId ||
        pendingByCardId.has(card.cardId)
      ) {
        toRewriteMarker.push(plannedCard);
      }

      if (!existingState) {
        toUpdate.push(plannedCard);
        continue;
      }

      if (
        existingState.rawBlockHash !== card.rawBlockHash ||
        !renderPlan.compatibleRenderConfigHashes.includes(existingState.renderConfigHash) ||
        existingState.orphan ||
        pendingByCardId.has(card.cardId)
      ) {
        toUpdate.push(plannedCard);
        continue;
      }

      unchangedCards += 1;
    }

    const scopedPaths = new Set(scopedFilePaths);
    const toOrphan = Object.values(state.cards).filter((card) => scopedPaths.has(card.filePath) && !cardsById.has(card.cardId));

    return {
      toCreate,
      toUpdate,
      toRewriteMarker,
      toOrphan,
      unchangedCards,
      warnings: Array.from(warningMap.values()),
    };
  }
}