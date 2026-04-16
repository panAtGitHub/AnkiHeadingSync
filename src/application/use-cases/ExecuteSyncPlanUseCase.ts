import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";

import type { ExecuteSyncPlanResult, ScanAndPlanResult } from "./types";

export class ExecuteSyncPlanUseCase {
  constructor(
    private readonly ankiGateway: AnkiGateway,
    private readonly syncRegistryRepository: SyncRegistryRepository,
    private readonly noteFieldMappingService = new NoteFieldMappingService(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async execute(scanAndPlanResult: ScanAndPlanResult): Promise<ExecuteSyncPlanResult> {
    const syncRegistry = new SyncRegistry(scanAndPlanResult.registry.list());
    const modelDetailsCache = new Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>();
    const timestamp = this.now();

    for (const card of scanAndPlanResult.cards) {
      const modelDetails = await this.getModelDetails(modelDetailsCache, card.noteModel);
      this.noteFieldMappingService.map(card, modelDetails, scanAndPlanResult.noteFieldMappings);
    }

    const syncCards = [
      ...scanAndPlanResult.plan.toAdd,
      ...scanAndPlanResult.plan.toUpdate.map((entry) => entry.card),
    ];

    for (const deckName of scanAndPlanResult.plan.toCreateDecks) {
      await this.ankiGateway.ensureDeckExists(deckName);
    }

    const uploadedMedia = await this.uploadMedia(syncCards);

    for (const card of scanAndPlanResult.plan.toAdd) {
      const modelDetails = await this.getModelDetails(modelDetailsCache, card.noteModel);
      const noteId = await this.ankiGateway.addNote({
        deckName: card.deck,
        modelName: card.noteModel,
        fields: this.noteFieldMappingService.map(card, modelDetails, scanAndPlanResult.noteFieldMappings),
        tags: card.tags,
      });

      syncRegistry.recordSync({
        cardKey: card.key,
        noteId,
        filePath: card.source.filePath,
        sourceHash: card.contentHash,
        lastSyncedAt: timestamp,
        orphan: false,
      });
    }

    for (const entry of scanAndPlanResult.plan.toUpdate) {
      const modelDetails = await this.getModelDetails(modelDetailsCache, entry.card.noteModel);
      await this.ankiGateway.updateNote({
        noteId: entry.noteId,
        deckName: entry.card.deck,
        fields: this.noteFieldMappingService.map(entry.card, modelDetails, scanAndPlanResult.noteFieldMappings),
      });

      syncRegistry.recordSync({
        cardKey: entry.card.key,
        noteId: entry.noteId,
        filePath: entry.card.source.filePath,
        sourceHash: entry.card.contentHash,
        lastSyncedAt: timestamp,
        orphan: false,
      });
    }

    const mutatedCardKeys = new Set(syncCards.map((card) => card.key));
    for (const card of scanAndPlanResult.cards) {
      if (mutatedCardKeys.has(card.key)) {
        continue;
      }

      const existingRecord = syncRegistry.get(card.key);
      if (!existingRecord) {
        continue;
      }

      syncRegistry.refresh(card.key, card.source.filePath, card.contentHash, timestamp);
    }

    for (const orphanRecord of scanAndPlanResult.plan.toMarkOrphan) {
      syncRegistry.markOrphan(orphanRecord.cardKey, timestamp);
    }

    await this.syncRegistryRepository.save(syncRegistry);

    return {
      created: scanAndPlanResult.plan.toAdd.length,
      updated: scanAndPlanResult.plan.toUpdate.length,
      markedOrphan: scanAndPlanResult.plan.toMarkOrphan.length,
      uploadedMedia,
      scanned: scanAndPlanResult.cards.length,
      unchanged:
        scanAndPlanResult.cards.length -
        scanAndPlanResult.plan.toAdd.length -
        scanAndPlanResult.plan.toUpdate.length,
    };
  }

  private async getModelDetails(
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    modelName: string,
  ): Promise<Awaited<ReturnType<AnkiGateway["getModelDetails"]>>> {
    const cached = modelDetailsCache.get(modelName);
    if (cached) {
      return cached;
    }

    const resolved = await this.ankiGateway.getModelDetails(modelName);
    modelDetailsCache.set(modelName, resolved);
    return resolved;
  }

  private async uploadMedia(cards: ScanAndPlanResult["cards"]): Promise<number> {
    const uniqueMedia = new Map<string, ScanAndPlanResult["cards"][number]["media"][number]>();

    for (const card of cards) {
      for (const asset of card.media) {
        uniqueMedia.set(`${asset.kind}:${asset.absolutePath}:${asset.fileName}`, asset);
      }
    }

    for (const asset of uniqueMedia.values()) {
      await this.ankiGateway.storeMedia(asset);
    }

    return uniqueMedia.size;
  }
}