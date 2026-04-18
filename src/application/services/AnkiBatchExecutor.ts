import type { NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import { BatchScheduler } from "@/application/services/BatchScheduler";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";
import type { RenderedSyncCard } from "@/domain/manual-sync/entities/RenderedSyncCard";
import type { PlannedCard, ManualSyncPlan } from "@/domain/manual-sync/value-objects/ManualSyncPlan";

export interface AnkiBatchExecutionResult {
  created: number;
  updated: number;
  uploadedMedia: number;
  markerWrites: PlannedCard[];
  resolvedNoteIds: Map<string, number | undefined>;
  touchedCardIds: Set<string>;
}

export class AnkiBatchExecutor {
  constructor(
    private readonly ankiGateway: AnkiGateway,
    private readonly noteFieldMappingService = new NoteFieldMappingService(),
    private readonly batchScheduler = new BatchScheduler(),
  ) {}

  async execute(
    plan: ManualSyncPlan,
    renderedCards: Map<string, RenderedSyncCard>,
    renderOnDemand: (plannedCard: PlannedCard) => Promise<RenderedSyncCard>,
    noteFieldMappings: Record<string, NoteModelFieldMapping>,
  ): Promise<AnkiBatchExecutionResult> {
    const modelDetailsCache = new Map<string, Promise<Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>>();
    const resolvedNoteIds = new Map<string, number | undefined>();
    const touchedCardIds = new Set<string>();
    const markerWriteMap = new Map<string, PlannedCard>();
    let created = 0;
    let updated = 0;

    const summaryIds = Array.from(new Set([...plan.toUpdate, ...plan.toRewriteMarker].flatMap((plannedCard) => plannedCard.noteId ? [plannedCard.noteId] : [])));
    const noteSummaries = await this.batchScheduler.runCollectBatches(summaryIds, 100, 1, (batch) => this.ankiGateway.getNoteSummaries(batch));
    const noteSummariesById = new Map(noteSummaries.map((summary) => [summary.noteId, summary]));

    const addQueue: RenderedSyncCard[] = [];
    const updateQueue: Array<{ plannedCard: PlannedCard; renderedCard: RenderedSyncCard }> = [];

    for (const plannedCard of plan.toCreate) {
      addQueue.push(await this.requireRenderedCard(plannedCard, renderedCards, renderOnDemand));
    }

    for (const plannedCard of plan.toUpdate) {
      if (plannedCard.noteId && noteSummariesById.has(plannedCard.noteId)) {
        updateQueue.push({ plannedCard, renderedCard: await this.requireRenderedCard(plannedCard, renderedCards, renderOnDemand) });
        continue;
      }

      addQueue.push(await this.requireRenderedCard(plannedCard, renderedCards, renderOnDemand));
      markerWriteMap.set(plannedCard.card.cardId, plannedCard);
    }

    for (const plannedCard of plan.toRewriteMarker) {
      if (markerWriteMap.has(plannedCard.card.cardId)) {
        continue;
      }

      if (plannedCard.noteId && noteSummariesById.has(plannedCard.noteId)) {
        markerWriteMap.set(plannedCard.card.cardId, plannedCard);
        resolvedNoteIds.set(plannedCard.card.cardId, plannedCard.noteId);
        continue;
      }

      addQueue.push(await this.requireRenderedCard(plannedCard, renderedCards, renderOnDemand));
      markerWriteMap.set(plannedCard.card.cardId, plannedCard);
    }

    await this.batchScheduler.runVoidBatches(
      Array.from(new Set(addQueue.map((card) => card.deck))),
      50,
      1,
      (batch) => this.ankiGateway.ensureDecks(batch),
    );

    const uploadedMedia = await this.uploadMedia([...addQueue, ...updateQueue.map((entry) => entry.renderedCard)]);

    const addedNoteIds = await this.batchScheduler.runCollectBatches(addQueue, 50, 1, async (batch) => {
      return this.ankiGateway.addNotes(
        await Promise.all(batch.map(async (renderedCard) => ({
          deckName: renderedCard.deck,
          modelName: renderedCard.noteModel,
          fields: await this.mapFields(renderedCard, noteFieldMappings, modelDetailsCache),
          tags: renderedCard.card.tagsHint,
        }))),
      );
    });

    for (let index = 0; index < addQueue.length; index += 1) {
      const renderedCard = addQueue[index];
      const noteId = addedNoteIds[index];
      created += 1;
      touchedCardIds.add(renderedCard.card.cardId);
      resolvedNoteIds.set(renderedCard.card.cardId, noteId);

      const existingMarkerWrite = markerWriteMap.get(renderedCard.card.cardId);
      markerWriteMap.set(renderedCard.card.cardId, {
        ...(existingMarkerWrite ?? {
          card: renderedCard.card,
          deck: renderedCard.deck,
          noteModel: renderedCard.noteModel,
          renderConfigHash: renderedCard.renderConfigHash,
        }),
        noteId,
      });
    }

    await this.batchScheduler.runVoidBatches(updateQueue, 50, 1, async (batch) => {
      await this.ankiGateway.updateNotes(
        await Promise.all(batch.map(async ({ plannedCard, renderedCard }) => ({
          noteId: plannedCard.noteId ?? 0,
          deckName: renderedCard.deck,
          fields: await this.mapFields(renderedCard, noteFieldMappings, modelDetailsCache),
        }))),
      );
    });

    updated += updateQueue.length;
    for (const { plannedCard } of updateQueue) {
      if (plannedCard.noteId) {
        touchedCardIds.add(plannedCard.card.cardId);
        resolvedNoteIds.set(plannedCard.card.cardId, plannedCard.noteId);
      }
    }

    return {
      created,
      updated,
      uploadedMedia,
      markerWrites: Array.from(markerWriteMap.values()).map((plannedCard) => ({
        ...plannedCard,
        noteId: resolvedNoteIds.get(plannedCard.card.cardId) ?? plannedCard.noteId,
      })),
      resolvedNoteIds,
      touchedCardIds,
    };
  }

  private async requireRenderedCard(
    plannedCard: PlannedCard,
    renderedCards: Map<string, RenderedSyncCard>,
    renderOnDemand: (plannedCard: PlannedCard) => Promise<RenderedSyncCard>,
  ): Promise<RenderedSyncCard> {
    const existing = renderedCards.get(plannedCard.card.cardId);
    if (existing) {
      return existing;
    }

    const rendered = await renderOnDemand(plannedCard);
    renderedCards.set(plannedCard.card.cardId, rendered);
    return rendered;
  }

  private async mapFields(
    renderedCard: RenderedSyncCard,
    noteFieldMappings: Record<string, NoteModelFieldMapping>,
    modelDetailsCache: Map<string, Promise<Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>>,
  ): Promise<Record<string, string>> {
    const modelDetails = await this.getModelDetails(renderedCard.noteModel, modelDetailsCache);
    return this.noteFieldMappingService.mapRenderedCard(
      {
        type: renderedCard.card.cardType,
        noteModel: renderedCard.noteModel,
        renderedFields: renderedCard.renderedFields,
      },
      modelDetails,
      noteFieldMappings,
    );
  }

  private async getModelDetails(
    noteModel: string,
    modelDetailsCache: Map<string, Promise<Awaited<ReturnType<AnkiGateway["getModelDetails"]>>>>,
  ): Promise<Awaited<ReturnType<AnkiGateway["getModelDetails"]>>> {
    const cached = modelDetailsCache.get(noteModel);
    if (cached) {
      return cached;
    }

    const pending = this.ankiGateway.getModelDetails(noteModel).catch((error) => {
      modelDetailsCache.delete(noteModel);
      throw error;
    });

    modelDetailsCache.set(noteModel, pending);
    return pending;
  }

  private async uploadMedia(renderedCards: RenderedSyncCard[]): Promise<number> {
    const uniqueMedia = new Map<string, MediaAsset>();

    for (const renderedCard of renderedCards) {
      for (const asset of renderedCard.media) {
        uniqueMedia.set(`${asset.kind}:${asset.absolutePath}:${asset.fileName}`, asset);
      }
    }

    await this.batchScheduler.runVoidBatches(Array.from(uniqueMedia.values()), 10, 3, (batch) => this.ankiGateway.storeMediaFiles(batch));
    return uniqueMedia.size;
  }
}