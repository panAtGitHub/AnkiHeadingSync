import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { MarkdownMarkerRemovalService } from "@/application/services/MarkdownMarkerRemovalService";
import type { CardState, PluginState } from "@/domain/manual-sync/entities/PluginState";

import type { ClearCurrentFileSyncedCardsResult } from "./cleanupResetTypes";

export class ClearCurrentFileSyncedCardsUseCase {
  constructor(
    private readonly pluginStateRepository: PluginStateRepository,
    private readonly ankiGateway: AnkiGateway,
    vaultGateway: ManualSyncVaultGateway,
    private readonly markdownMarkerRemovalService = new MarkdownMarkerRemovalService(vaultGateway),
  ) {}

  async hasTrackedCards(filePath: string): Promise<boolean> {
    const state = await this.pluginStateRepository.load();
    return collectTrackedCards(state, filePath).length > 0;
  }

  async execute(filePath: string): Promise<ClearCurrentFileSyncedCardsResult> {
    const state = await this.pluginStateRepository.load();
    const trackedCards = collectTrackedCards(state, filePath);

    if (trackedCards.length === 0) {
      return {
        trackedCards: 0,
        deletedNotes: 0,
        removedMarkers: 0,
        deletedLocalRecords: 0,
        conflictFiles: [],
        failureFiles: [],
      };
    }

    const noteIds = Array.from(new Set(trackedCards.flatMap((card) => typeof card.noteId === "number" ? [card.noteId] : [])));
    if (noteIds.length > 0) {
      await this.ankiGateway.deleteNotes(noteIds);
    }

    const markerRemovalResult = await this.markdownMarkerRemovalService.remove(
      filePath,
      trackedCards.map((card) => ({ cardId: card.cardId })),
    );

    const nextState = buildNextState(state, filePath, trackedCards, markerRemovalResult.conflictFiles.length > 0 || markerRemovalResult.failureFiles.length > 0);
    await this.pluginStateRepository.save(nextState);

    return {
      trackedCards: trackedCards.length,
      deletedNotes: noteIds.length,
      removedMarkers: markerRemovalResult.removedMarkers,
      deletedLocalRecords: markerRemovalResult.conflictFiles.length === 0 && markerRemovalResult.failureFiles.length === 0 ? trackedCards.length : 0,
      conflictFiles: markerRemovalResult.conflictFiles,
      failureFiles: markerRemovalResult.failureFiles,
    };
  }
}

function collectTrackedCards(state: PluginState, filePath: string): CardState[] {
  const trackedCardIds = new Set<string>();

  for (const cardId of state.files[filePath]?.cardIds ?? []) {
    if (state.cards[cardId]) {
      trackedCardIds.add(cardId);
    }
  }

  for (const card of Object.values(state.cards)) {
    if (card.filePath === filePath) {
      trackedCardIds.add(card.cardId);
    }
  }

  return Array.from(trackedCardIds)
    .map((cardId) => state.cards[cardId])
    .filter((card): card is CardState => Boolean(card));
}

function buildNextState(state: PluginState, filePath: string, trackedCards: CardState[], keepSanitizedCards: boolean): PluginState {
  const trackedCardIds = new Set(trackedCards.map((card) => card.cardId));
  const nextCards = { ...state.cards };

  for (const trackedCard of trackedCards) {
    if (!keepSanitizedCards) {
      delete nextCards[trackedCard.cardId];
      continue;
    }

    nextCards[trackedCard.cardId] = {
      ...trackedCard,
      noteId: undefined,
    };
  }

  const nextFiles = { ...state.files };
  delete nextFiles[filePath];

  return {
    files: nextFiles,
    cards: nextCards,
    pendingWriteBack: state.pendingWriteBack.filter((pending) => pending.filePath !== filePath && !trackedCardIds.has(pending.cardId)),
  };
}