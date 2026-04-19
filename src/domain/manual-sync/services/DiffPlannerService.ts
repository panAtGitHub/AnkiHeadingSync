import type { PluginSettings } from "@/application/config/PluginSettings";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { createPendingWriteBackKey, toNoteIdKey, type PluginState } from "@/domain/manual-sync/entities/PluginState";
import { getDeckResolutionWarningKey, type DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import type { ManualSyncPlan, PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";

export class DiffPlannerService {
  constructor(private readonly renderConfigService = new RenderConfigService()) {}

  plan(cards: IndexedCard[], state: PluginState, scopedFilePaths: string[], settings: PluginSettings): ManualSyncPlan {
    const cardsBySyncKey = new Map<string, IndexedCard>();
    const pendingByBlockKey = new Set(state.pendingWriteBack.map((pending) => createPendingWriteBackKey(pending.filePath, pending.blockStartLine, pending.rawBlockHash)));
    const seenNoteKeys = new Set<string>();
    const toCreate: PlannedCard[] = [];
    const toUpdate: PlannedCard[] = [];
    const toVerifyDeck: PlannedCard[] = [];
    const toChangeDeck: PlannedCard[] = [];
    const toRewriteMarker: PlannedCard[] = [];
    const warningMap = new Map<string, DeckResolutionWarning>();
    let unchangedCards = 0;

    for (const card of cards) {
      if (cardsBySyncKey.has(card.syncKey)) {
        throw new Error(`Duplicate syncKey detected in current scan: ${card.syncKey}`);
      }

      cardsBySyncKey.set(card.syncKey, card);
      if (card.noteId !== undefined) {
        const noteKey = toNoteIdKey(card.noteId);
        if (seenNoteKeys.has(noteKey)) {
          throw new Error(`Duplicate noteId detected in current scan: ${card.noteId}`);
        }

        seenNoteKeys.add(noteKey);
      }

      const existingState = card.noteId !== undefined ? state.cards[toNoteIdKey(card.noteId)] : undefined;
      const renderPlan = this.renderConfigService.resolve(card, settings);
      for (const warning of renderPlan.warnings) {
        warningMap.set(getDeckResolutionWarningKey(warning), warning);
      }
      const resolvedNoteId = card.noteId;
      const blockKey = createPendingWriteBackKey(card.filePath, card.blockStartLine, card.rawBlockHash);
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

      toVerifyDeck.push(plannedCard);

      if (card.idMarkerState !== "present-valid" || card.noteIdSource !== "marker" || pendingByBlockKey.has(blockKey)) {
        toRewriteMarker.push(plannedCard);
      }

      if (!existingState) {
        toUpdate.push(plannedCard);
        continue;
      }

      const fieldsChanged =
        existingState.rawBlockHash !== card.rawBlockHash ||
        existingState.renderConfigHash !== renderPlan.renderConfigHash ||
        existingState.orphan;
      const deckChanged = existingState.deck !== renderPlan.deck;

      if (fieldsChanged) {
        toUpdate.push(plannedCard);
      }

      if (deckChanged) {
        toChangeDeck.push(plannedCard);
      }

      if (!fieldsChanged && !deckChanged) {
        unchangedCards += 1;
      }
    }

    const scopedPaths = new Set(scopedFilePaths);
    const toOrphan = Object.values(state.cards).filter((card) => scopedPaths.has(card.filePath) && !seenNoteKeys.has(toNoteIdKey(card.noteId)));

    return {
      toCreate,
      toUpdate,
      toVerifyDeck,
      toChangeDeck,
      toRewriteMarker,
      toOrphan,
      unchangedCards,
      warnings: Array.from(warningMap.values()),
    };
  }
}