import {
  HeadingSyncMarkerBatchError,
  HeadingSyncMarkerService,
  type MarkerWriteRequest,
} from "@/application/services/HeadingSyncMarkerService";
import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import { MarkdownWriteConflictError, type VaultGateway } from "@/application/ports/VaultGateway";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";
import type { Card } from "@/domain/card/entities/Card";
import type { SyncRecord } from "@/domain/sync/entities/SyncRecord";

import type { ExecuteSyncPlanResult, ScanAndPlanResult } from "./types";

interface MarkerWriteFailure {
  filePath: string;
  message: string;
}

export class ExecuteSyncPlanUseCase {
  constructor(
    private readonly ankiGateway: AnkiGateway,
    private readonly syncRegistryRepository: SyncRegistryRepository,
    private readonly vaultGateway: VaultGateway,
    private readonly noteFieldMappingService = new NoteFieldMappingService(),
    private readonly now: () => number = () => Date.now(),
    private readonly headingSyncMarkerService = new HeadingSyncMarkerService(),
  ) {}

  async execute(scanAndPlanResult: ScanAndPlanResult): Promise<ExecuteSyncPlanResult> {
    const syncRegistry = new SyncRegistry(scanAndPlanResult.registry.list());
    const modelDetailsCache = new Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>();
    const noteSummaries = await this.loadNoteSummaries(scanAndPlanResult.plan.toUpdate.map((entry) => entry.noteId));
    const timestamp = this.now();
    const markerWrites: MarkerWriteRequest[] = [];

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
      const noteId = await this.addNote(card, modelDetailsCache, scanAndPlanResult);
      markerWrites.push(this.createMarkerWriteRequest(card, noteId, "insert"));
    }

    for (const entry of scanAndPlanResult.plan.toUpdate) {
      const existingRecord = entry.card.embeddedNoteId
        ? syncRegistry.findByNoteId(entry.noteId)
        : syncRegistry.get(entry.card.key);

      if (entry.card.embeddedNoteId) {
        const markerWrite = await this.updateEmbeddedCard(
          entry.card,
          entry.noteId,
          noteSummaries.get(entry.noteId),
          syncRegistry,
          timestamp,
          modelDetailsCache,
          scanAndPlanResult,
        );
        if (markerWrite) {
          markerWrites.push(markerWrite);
        }
        continue;
      }

      if (existingRecord?.identityMode === "pending-note-id-write") {
        markerWrites.push(
          await this.retryPendingMarkerWrite(
            entry.card,
            existingRecord,
            noteSummaries.get(entry.noteId),
            modelDetailsCache,
            scanAndPlanResult,
          ),
        );
        continue;
      }

      await this.updateLegacyCard(entry.card, entry.noteId, existingRecord, syncRegistry, timestamp, modelDetailsCache, scanAndPlanResult);
    }

    const markerWriteFailures = await this.flushMarkerWrites(markerWrites, syncRegistry, timestamp);

    const mutatedCardKeys = new Set(syncCards.map((card) => card.key));
    for (const card of scanAndPlanResult.cards) {
      if (mutatedCardKeys.has(card.key)) {
        continue;
      }

      const existingRecord = syncRegistry.get(card.key);
      if (card.embeddedNoteId) {
        const embeddedRecord = syncRegistry.findByNoteId(card.embeddedNoteId);
        if (!embeddedRecord) {
          continue;
        }

        syncRegistry.recordSync(this.createEmbeddedRecord(card, embeddedRecord.noteId, timestamp));
        continue;
      }

      if (!existingRecord) {
        continue;
      }

      syncRegistry.recordSync({
        ...existingRecord,
        cardKey: card.key,
        filePath: card.source.filePath,
        sourceHash: card.contentHash,
        lastSyncedAt: timestamp,
        orphan: false,
      });
    }

    for (const orphanRecord of scanAndPlanResult.plan.toMarkOrphan) {
      syncRegistry.markOrphan(orphanRecord.cardKey, timestamp);
    }

    await this.syncRegistryRepository.save(syncRegistry);

    if (markerWriteFailures.length > 0) {
      throw this.createMarkerWriteFailureError(markerWriteFailures);
    }

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


  private async updateEmbeddedCard(
    card: Card,
    noteId: number,
    noteSummary: Awaited<ReturnType<AnkiGateway["getNoteSummaries"]>>[number] | undefined,
    syncRegistry: SyncRegistry,
    timestamp: number,
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    scanAndPlanResult: ScanAndPlanResult,
  ): Promise<MarkerWriteRequest | undefined> {
    if (!noteSummary) {
      const recreatedNoteId = await this.addNote(card, modelDetailsCache, scanAndPlanResult);
      return this.createMarkerWriteRequest(card, recreatedNoteId, "replace");
    }

    this.assertModelMatches(card, noteSummary.modelName, noteId);
    await this.updateExistingNote(card, noteId, modelDetailsCache, scanAndPlanResult);
    syncRegistry.recordSync(this.createEmbeddedRecord(card, noteId, timestamp));
    return undefined;
  }

  private async retryPendingMarkerWrite(
    card: Card,
    existingRecord: SyncRecord,
    noteSummary: Awaited<ReturnType<AnkiGateway["getNoteSummaries"]>>[number] | undefined,
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    scanAndPlanResult: ScanAndPlanResult,
  ): Promise<MarkerWriteRequest> {
    let noteId = existingRecord.noteId;

    if (!noteSummary) {
      noteId = await this.addNote(card, modelDetailsCache, scanAndPlanResult);
    } else {
      await this.updateExistingNote(card, noteId, modelDetailsCache, scanAndPlanResult);
    }

    return this.createMarkerWriteRequest(card, noteId, card.source.markerLine ? "replace" : "insert");
  }

  private async updateLegacyCard(
    card: Card,
    noteId: number,
    existingRecord: SyncRecord | undefined,
    syncRegistry: SyncRegistry,
    timestamp: number,
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    scanAndPlanResult: ScanAndPlanResult,
  ): Promise<void> {
    await this.updateExistingNote(card, noteId, modelDetailsCache, scanAndPlanResult);
    syncRegistry.recordSync({
      cardKey: card.key,
      identityMode: existingRecord?.identityMode ?? "legacy-card-key",
      legacyCardKey: existingRecord?.legacyCardKey,
      noteId,
      filePath: card.source.filePath,
      sourceHash: card.contentHash,
      lastSyncedAt: timestamp,
      orphan: false,
    });
  }

  private createEmbeddedRecord(card: Card, noteId: number, timestamp: number): SyncRecord {
    return {
      cardKey: card.key,
      identityMode: "embedded-note-id",
      noteId,
      filePath: card.source.filePath,
      sourceHash: card.contentHash,
      lastSyncedAt: timestamp,
      orphan: false,
    };
  }

  private createEmbeddedRecordFromWrite(write: MarkerWriteRequest, timestamp: number): SyncRecord {
    return {
      cardKey: write.cardKey,
      identityMode: "embedded-note-id",
      noteId: write.noteId,
      filePath: write.filePath,
      sourceHash: write.sourceHash,
      lastSyncedAt: timestamp,
      orphan: false,
    };
  }

  private createPendingRecord(card: Card, noteId: number, timestamp: number): SyncRecord {
    return {
      cardKey: card.key,
      identityMode: "pending-note-id-write",
      legacyCardKey: card.key,
      noteId,
      filePath: card.source.filePath,
      sourceHash: card.contentHash,
      lastSyncedAt: timestamp,
      orphan: false,
    };
  }

  private createPendingRecordFromWrite(write: MarkerWriteRequest, timestamp: number): SyncRecord {
    return {
      cardKey: write.cardKey,
      identityMode: "pending-note-id-write",
      legacyCardKey: write.cardKey,
      noteId: write.noteId,
      filePath: write.filePath,
      sourceHash: write.sourceHash,
      lastSyncedAt: timestamp,
      orphan: false,
    };
  }

  private async addNote(
    card: Card,
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    scanAndPlanResult: ScanAndPlanResult,
  ): Promise<number> {
    const modelDetails = await this.getModelDetails(modelDetailsCache, card.noteModel);

    return this.ankiGateway.addNote({
      deckName: card.deck,
      modelName: card.noteModel,
      fields: this.noteFieldMappingService.map(card, modelDetails, scanAndPlanResult.noteFieldMappings),
      tags: card.tags,
    });
  }

  private async updateExistingNote(
    card: Card,
    noteId: number,
    modelDetailsCache: Map<string, Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>,
    scanAndPlanResult: ScanAndPlanResult,
  ): Promise<void> {
    const modelDetails = await this.getModelDetails(modelDetailsCache, card.noteModel);
    await this.ankiGateway.updateNote({
      noteId,
      deckName: card.deck,
      fields: this.noteFieldMappingService.map(card, modelDetails, scanAndPlanResult.noteFieldMappings),
    });
  }

  private createMarkerWriteRequest(card: Card, noteId: number, mode: MarkerWriteRequest["mode"]): MarkerWriteRequest {
    return {
      cardKey: card.key,
      filePath: card.source.filePath,
      noteId,
      location: card.source,
      mode,
      sourceHash: card.contentHash,
    };
  }

  private async flushMarkerWrites(writes: MarkerWriteRequest[], syncRegistry: SyncRegistry, timestamp: number): Promise<MarkerWriteFailure[]> {
    const failures: MarkerWriteFailure[] = [];
    const writesByFile = new Map<string, MarkerWriteRequest[]>();

    for (const write of writes) {
      const fileWrites = writesByFile.get(write.filePath);
      if (fileWrites) {
        fileWrites.push(write);
        continue;
      }

      writesByFile.set(write.filePath, [write]);
    }

    for (const [filePath, fileWrites] of writesByFile.entries()) {
      try {
        const sourceContent = this.requireSourceContent(filePath, fileWrites);
        const nextContent = this.headingSyncMarkerService.applyBatch(sourceContent, fileWrites);
        await this.vaultGateway.replaceMarkdownFile(filePath, sourceContent, nextContent);

        for (const write of fileWrites) {
          syncRegistry.recordSync(this.createEmbeddedRecordFromWrite(write, timestamp));
        }
      } catch (error) {
        for (const write of fileWrites) {
          syncRegistry.recordSync(this.createPendingRecordFromWrite(write, timestamp));
        }

        if (!this.isRecoverableMarkerWriteError(error)) {
          failures.push({
            filePath,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return failures;
  }

  private requireSourceContent(filePath: string, writes: MarkerWriteRequest[]): string {
    const sourceContent = writes[0]?.location.sourceContent;
    if (!sourceContent) {
      throw new HeadingSyncMarkerBatchError(`Missing scanned source content for ${filePath}.`);
    }

    return sourceContent;
  }

  private isRecoverableMarkerWriteError(error: unknown): boolean {
    return error instanceof MarkdownWriteConflictError;
  }

  private createMarkerWriteFailureError(failures: MarkerWriteFailure[]): Error {
    const details = failures.map((failure) => `${failure.filePath}: ${failure.message}`).join("\n");
    return new Error(`Failed to persist AHS markers for ${failures.length} file(s).\n${details}`);
  }

  private assertModelMatches(card: Card, actualModelName: string, noteId: number): void {
    if (actualModelName === card.noteModel) {
      return;
    }

    throw new Error(
      `Embedded Anki note ${noteId} uses model ${actualModelName}, but ${card.heading} now requires ${card.noteModel}. Recreate the card instead of switching basic/cloze types.`,
    );
  }

  private async loadNoteSummaries(noteIds: number[]): Promise<Map<number, Awaited<ReturnType<AnkiGateway["getNoteSummaries"]>>[number]>> {
    const uniqueNoteIds = Array.from(new Set(noteIds));
    const resolved = await this.ankiGateway.getNoteSummaries(uniqueNoteIds);
    return new Map(resolved.map((summary) => [summary.noteId, summary]));
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