import type { PluginSettings } from "@/application/config/PluginSettings";
import { validatePluginSettings } from "@/application/config/PluginSettings";
import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { AnkiBatchExecutor } from "@/application/services/AnkiBatchExecutor";
import { FileIndexerService } from "@/application/services/FileIndexerService";
import { MarkdownWriteBackService } from "@/application/services/MarkdownWriteBackService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import { ScanScopeService } from "@/application/services/ScanScopeService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { PluginState } from "@/domain/manual-sync/entities/PluginState";
import type { RenderedSyncCard } from "@/domain/manual-sync/entities/RenderedSyncCard";
import { DiffPlannerService } from "@/domain/manual-sync/services/DiffPlannerService";
import { ManualCardRenderer, type ManualCardRenderContext } from "@/domain/manual-sync/services/ManualCardRenderer";

import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

export class CurrentFileOutOfScopeError extends Error {
  constructor(filePath: string) {
    super(`当前文件不在插件作用范围内: ${filePath}`);
    this.name = "CurrentFileOutOfScopeError";
  }
}

export class ManualSyncService {
  private readonly scanScopeService = new ScanScopeService();

  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly pluginStateRepository: PluginStateRepository,
    private readonly ankiGateway: AnkiGateway,
    private readonly fileIndexerService = new FileIndexerService(vaultGateway),
    private readonly diffPlannerService = new DiffPlannerService(),
    private readonly renderer = new ManualCardRenderer(),
    private readonly ankiBatchExecutor = new AnkiBatchExecutor(ankiGateway),
    private readonly markdownWriteBackService = new MarkdownWriteBackService(vaultGateway),
    private readonly renderConfigService = new RenderConfigService(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async syncVault(settings: PluginSettings): Promise<ManualSyncResult> {
    validatePluginSettings(settings);
    const state = await this.pluginStateRepository.load();
    const indexResult = await this.fileIndexerService.indexVault(settings, state);
    return this.syncIndexedResult(indexResult, state, settings);
  }

  async syncFile(filePath: string, settings: PluginSettings): Promise<ManualSyncResult> {
    validatePluginSettings(settings);
    if (!this.scanScopeService.isPathInScope(filePath, settings.scopeMode, settings.includeFolders, settings.excludeFolders)) {
      throw new CurrentFileOutOfScopeError(filePath);
    }

    const state = await this.pluginStateRepository.load();
    const indexResult = await this.fileIndexerService.indexFile(filePath, settings, state);
    return this.syncIndexedResult(indexResult, state, settings);
  }

  async rebuildIndex(settings: PluginSettings): Promise<ManualSyncResult> {
    validatePluginSettings(settings);
    const state = await this.pluginStateRepository.load();
    const indexResult = await this.fileIndexerService.indexVault(settings, state, true);
    const plan = this.diffPlannerService.plan(indexResult.cards, state, indexResult.scopedFilePaths, settings);
    const indexedFilesByPath = new Map(indexResult.indexedFiles.map((file) => [file.filePath, file]));
    const markerWrites = [
      ...plan.toRewriteMarker,
      ...plan.toCreate.filter((plannedCard) => plannedCard.card.markerState === "missing"),
    ];

    const writeBackResult = await this.markdownWriteBackService.write(markerWrites, indexedFilesByPath);
    const nextState = this.buildNextState(
      state,
      indexResult.cards,
      indexResult.indexedFiles,
      settings,
      new Set(writeBackResult.writtenCardIds),
      new Map(),
      plan.toOrphan,
    );
    nextState.pendingWriteBack = [
      ...state.pendingWriteBack.filter((pending) => !new Set(indexResult.scopedFilePaths).has(pending.filePath)),
      ...writeBackResult.pendingEntries,
    ];
    await this.pluginStateRepository.save(nextState);

    if (writeBackResult.failureFiles.length > 0) {
      throw new Error(this.createWriteBackFailureMessage(writeBackResult.failureFiles));
    }

    return {
      scannedFiles: indexResult.scannedFiles,
      scannedCards: indexResult.cards.length,
      created: 0,
      updated: 0,
      orphaned: plan.toOrphan.length,
      uploadedMedia: 0,
      skippedUnchangedCards: indexResult.skippedUnchangedCards,
      rewrittenMarkers: writeBackResult.writtenCardIds.length,
      markerWriteConflictFiles: writeBackResult.conflictFiles,
      warnings: plan.warnings,
    };
  }

  private async syncIndexedResult(
    indexResult: Awaited<ReturnType<FileIndexerService["indexVault"]>>,
    state: PluginState,
    settings: PluginSettings,
  ): Promise<ManualSyncResult> {
    const plan = this.diffPlannerService.plan(indexResult.cards, state, indexResult.scopedFilePaths, settings);
    const renderContext: ManualCardRenderContext = {
      addObsidianBacklink: settings.addObsidianBacklink,
      convertHighlightsToCloze: settings.convertHighlightsToCloze,
      resourceResolver: this.vaultGateway,
    };
    const renderedCards = new Map<string, RenderedSyncCard>();

    for (const plannedCard of [...plan.toCreate, ...plan.toUpdate]) {
      if (!renderedCards.has(plannedCard.card.cardId)) {
        renderedCards.set(plannedCard.card.cardId, this.renderer.render(plannedCard, renderContext));
      }
    }

    const executionResult = await this.ankiBatchExecutor.execute(
      plan,
      renderedCards,
      async (plannedCard) => this.renderer.render(plannedCard, renderContext),
      settings.noteFieldMappings,
    );

    const indexedFilesByPath = new Map(indexResult.indexedFiles.map((file) => [file.filePath, file]));
    const writeBackResult = await this.markdownWriteBackService.write(executionResult.markerWrites, indexedFilesByPath);

    const nextState = this.buildNextState(
      state,
      indexResult.cards,
      indexResult.indexedFiles,
      settings,
      new Set([...executionResult.touchedCardIds, ...writeBackResult.writtenCardIds]),
      executionResult.resolvedNoteIds,
      plan.toOrphan,
    );

    nextState.pendingWriteBack = [
      ...state.pendingWriteBack.filter((pending) => !new Set(indexResult.scopedFilePaths).has(pending.filePath)),
      ...writeBackResult.pendingEntries,
    ];

    await this.pluginStateRepository.save(nextState);

    if (writeBackResult.failureFiles.length > 0) {
      throw new Error(this.createWriteBackFailureMessage(writeBackResult.failureFiles));
    }

    return {
      scannedFiles: indexResult.scannedFiles,
      scannedCards: indexResult.cards.length,
      created: executionResult.created,
      updated: executionResult.updated,
      orphaned: plan.toOrphan.length,
      uploadedMedia: executionResult.uploadedMedia,
      skippedUnchangedCards: indexResult.skippedUnchangedCards,
      rewrittenMarkers: writeBackResult.writtenCardIds.length,
      markerWriteConflictFiles: writeBackResult.conflictFiles,
      warnings: plan.warnings,
    };
  }

  private buildNextState(
    previousState: PluginState,
    cards: IndexedCard[],
    indexedFiles: Array<{ filePath: string; fileHash: string; fileStamp: string; content?: string; cards: IndexedCard[] }>,
    settings: PluginSettings,
    touchedCardIds: Set<string>,
    resolvedNoteIds: Map<string, number | undefined>,
    orphanCards: Array<{ cardId: string }>,
  ): PluginState {
    const now = this.now();
    const nextState: PluginState = {
      files: { ...previousState.files },
      cards: { ...previousState.cards },
      pendingWriteBack: [...previousState.pendingWriteBack],
    };

    for (const indexedFile of indexedFiles) {
      if (indexedFile.content === undefined) {
        continue;
      }

      nextState.files[indexedFile.filePath] = {
        filePath: indexedFile.filePath,
        fileHash: indexedFile.fileHash,
        fileStamp: indexedFile.fileStamp,
        lastIndexedAt: now,
        cardIds: indexedFile.cards.map((card) => card.cardId),
      };
    }

    for (const card of cards) {
      const existingState = previousState.cards[card.cardId];
      const renderPlan = this.renderConfigService.resolve(card, settings);
      const noteId = resolvedNoteIds.get(card.cardId) ?? existingState?.noteId ?? card.noteId;

      nextState.cards[card.cardId] = {
        cardId: card.cardId,
        noteId,
        filePath: card.filePath,
        heading: card.heading,
        headingLevel: card.headingLevel,
        bodyMarkdown: card.bodyMarkdown,
        cardType: card.cardType,
        blockStartOffset: card.blockStartOffset,
        blockEndOffset: card.blockEndOffset,
        blockStartLine: card.blockStartLine,
        bodyStartLine: card.bodyStartLine,
        blockEndLine: card.blockEndLine,
        contentEndLine: card.contentEndLine,
        markerLine: card.markerLine,
        rawBlockText: card.rawBlockText,
        rawBlockHash: card.rawBlockHash,
        renderConfigHash: renderPlan.renderConfigHash,
        deck: renderPlan.deck,
        deckHint: card.deckHint,
        deckHintSource: card.deckHintSource,
        deckWarnings: [...card.deckWarnings],
        tagsHint: card.tagsHint,
        lastSyncedAt: touchedCardIds.has(card.cardId) ? now : existingState?.lastSyncedAt ?? 0,
        orphan: false,
      };
    }

    for (const orphanCard of orphanCards) {
      const existing = nextState.cards[orphanCard.cardId];
      if (!existing) {
        continue;
      }

      nextState.cards[orphanCard.cardId] = {
        ...existing,
        orphan: true,
      };
    }

    return nextState;
  }

  private createWriteBackFailureMessage(failures: Array<{ filePath: string; message: string }>): string {
    return `Markdown marker write-back failed for ${failures.length} file(s).\n${failures.map((failure) => `${failure.filePath}: ${failure.message}`).join("\n")}`;
  }
}