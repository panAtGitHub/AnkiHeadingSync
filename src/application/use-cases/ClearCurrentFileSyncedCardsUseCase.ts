import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { MarkdownSyncedMarkerRemovalService } from "@/application/services/MarkdownSyncedMarkerRemovalService";
import { toNoteIdKey, type CardState, type GroupBlockState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

import type { ClearCurrentFileSyncedCardsResult } from "./cleanupResetTypes";

export class ClearCurrentFileSyncedCardsUseCase {
  constructor(
    private readonly pluginStateRepository: PluginStateRepository,
    private readonly ankiGateway: AnkiGateway,
    vaultGateway: ManualSyncVaultGateway,
    private readonly markdownMarkerRemovalService = new MarkdownSyncedMarkerRemovalService(vaultGateway),
  ) {}

  async hasTrackedCards(filePath: string): Promise<boolean> {
    const state = await this.pluginStateRepository.load();
    const trackedEntries = collectTrackedEntries(state, filePath);
    return trackedEntries.trackedCards.length > 0 || trackedEntries.trackedGroups.length > 0;
  }

  async execute(filePath: string): Promise<ClearCurrentFileSyncedCardsResult> {
    const state = await this.pluginStateRepository.load();
    const trackedEntries = collectTrackedEntries(state, filePath);

    if (trackedEntries.trackedCards.length === 0 && trackedEntries.trackedGroups.length === 0) {
      return createEmptyResult();
    }

    const noteIds = trackedEntries.noteIds;
    if (noteIds.length > 0) {
      await this.ankiGateway.deleteNotes(noteIds);
    }

    const markerRemovalResult = await this.markdownMarkerRemovalService.remove(
      filePath,
      trackedEntries.trackedCards.map((card) => ({ noteId: card.noteId })),
      trackedEntries.trackedGroups.map((group) => ({
        noteId: group.noteId,
        groupId: group.groupId,
        blockStartLine: group.blockStartLine,
      })),
    );

    const nextState = buildNextState(state, filePath, trackedEntries);
    await this.pluginStateRepository.save(nextState);

    return {
      trackedCards: trackedEntries.trackedCards.length,
      trackedGroups: trackedEntries.trackedGroups.length,
      deletedNotes: noteIds.length,
      removedMarkers: markerRemovalResult.removedMarkers,
      removedCardMarkers: markerRemovalResult.removedCardMarkers,
      removedGroupMarkers: markerRemovalResult.removedGroupMarkers,
      deletedLocalRecords: trackedEntries.trackedCards.length + trackedEntries.trackedGroups.length,
      conflictFiles: markerRemovalResult.conflictFiles,
      failureFiles: markerRemovalResult.failureFiles,
    };
  }
}

interface TrackedSyncedEntries {
  trackedCards: CardState[];
  trackedGroups: GroupBlockState[];
  noteIds: number[];
}

function collectTrackedEntries(state: PluginState, filePath: string): TrackedSyncedEntries {
  const trackedNoteKeys = new Set<string>();
  const trackedGroupIds = new Set<string>();
  const groupBlocks = state.groupBlocks ?? {};

  for (const noteId of state.files[filePath]?.noteIds ?? []) {
    const noteKey = toNoteIdKey(noteId);
    if (state.cards[noteKey]) {
      trackedNoteKeys.add(noteKey);
    }
  }

  for (const groupId of state.files[filePath]?.groupIds ?? []) {
    if (groupBlocks[groupId]) {
      trackedGroupIds.add(groupId);
    }
  }

  for (const card of Object.values(state.cards)) {
    if (card.filePath === filePath) {
      trackedNoteKeys.add(toNoteIdKey(card.noteId));
    }
  }

  for (const [groupId, groupBlock] of Object.entries(groupBlocks)) {
    if (groupBlock.filePath === filePath) {
      trackedGroupIds.add(groupId);
    }
  }

  const trackedCards = Array.from(trackedNoteKeys)
    .map((noteKey) => state.cards[noteKey])
    .filter((card): card is CardState => Boolean(card));

  const trackedGroups = Array.from(trackedGroupIds)
    .map((groupId) => groupBlocks[groupId])
    .filter((group): group is GroupBlockState => Boolean(group));

  return {
    trackedCards,
    trackedGroups,
    noteIds: Array.from(new Set([
      ...trackedCards.map((card) => card.noteId),
      ...trackedGroups.map((group) => group.noteId),
    ])),
  };
}

function buildNextState(state: PluginState, filePath: string, trackedEntries: TrackedSyncedEntries): PluginState {
  const nextCards = { ...state.cards };
  const nextGroupBlocks = { ...(state.groupBlocks ?? {}) };

  for (const trackedCard of trackedEntries.trackedCards) {
    delete nextCards[toNoteIdKey(trackedCard.noteId)];
  }

  for (const trackedGroup of trackedEntries.trackedGroups) {
    delete nextGroupBlocks[trackedGroup.groupId];
  }

  const nextFiles = { ...state.files };
  delete nextFiles[filePath];

  return {
    files: nextFiles,
    cards: nextCards,
    groupBlocks: state.groupBlocks ? nextGroupBlocks : undefined,
    pendingWriteBack: state.pendingWriteBack.filter((pending) => pending.filePath !== filePath),
  };
}

function createEmptyResult(): ClearCurrentFileSyncedCardsResult {
  return {
    trackedCards: 0,
    trackedGroups: 0,
    deletedNotes: 0,
    removedMarkers: 0,
    removedCardMarkers: 0,
    removedGroupMarkers: 0,
    deletedLocalRecords: 0,
    conflictFiles: [],
    failureFiles: [],
  };
}