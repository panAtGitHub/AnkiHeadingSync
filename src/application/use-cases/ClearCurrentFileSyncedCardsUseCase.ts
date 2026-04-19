import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { MarkdownMarkerRemovalService } from "@/application/services/MarkdownMarkerRemovalService";
import { toNoteIdKey, type CardState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

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
      trackedCards.map((card) => ({ noteId: card.noteId })),
    );

    const nextState = buildNextState(state, filePath, trackedCards);
    await this.pluginStateRepository.save(nextState);

    return {
      trackedCards: trackedCards.length,
      deletedNotes: noteIds.length,
      removedMarkers: markerRemovalResult.removedMarkers,
      deletedLocalRecords: trackedCards.length,
      conflictFiles: markerRemovalResult.conflictFiles,
      failureFiles: markerRemovalResult.failureFiles,
    };
  }
}

function collectTrackedCards(state: PluginState, filePath: string): CardState[] {
  const trackedNoteKeys = new Set<string>();

  for (const noteId of state.files[filePath]?.noteIds ?? []) {
    const noteKey = toNoteIdKey(noteId);
    if (state.cards[noteKey]) {
      trackedNoteKeys.add(noteKey);
    }
  }

  for (const card of Object.values(state.cards)) {
    if (card.filePath === filePath) {
      trackedNoteKeys.add(toNoteIdKey(card.noteId));
    }
  }

  return Array.from(trackedNoteKeys)
    .map((noteKey) => state.cards[noteKey])
    .filter((card): card is CardState => Boolean(card));
}

function buildNextState(state: PluginState, filePath: string, trackedCards: CardState[]): PluginState {
  const trackedNoteKeys = new Set(trackedCards.map((card) => toNoteIdKey(card.noteId)));
  const nextCards = { ...state.cards };

  for (const trackedCard of trackedCards) {
    delete nextCards[toNoteIdKey(trackedCard.noteId)];
  }

  const nextFiles = { ...state.files };
  delete nextFiles[filePath];

  return {
    files: nextFiles,
    cards: nextCards,
    pendingWriteBack: state.pendingWriteBack.filter((pending) => pending.filePath !== filePath && !trackedNoteKeys.has(toNoteIdKey(pending.targetNoteId))),
  };
}