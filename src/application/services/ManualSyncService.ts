import type { PluginSettings } from "@/application/config/PluginSettings";
import { isRunScopeConfigured, validatePluginSettings } from "@/application/config/PluginSettings";
import { PluginUserError, type PluginFileFailure } from "@/application/errors/PluginUserError";
import type { AnkiGateway, AnkiGroupGateway } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { AnkiBatchExecutor } from "@/application/services/AnkiBatchExecutor";
import { FileIndexerService } from "@/application/services/FileIndexerService";
import { createDeckRulesFingerprint } from "@/application/services/FileIndexerService";
import { MarkdownWriteBackService } from "@/application/services/MarkdownWriteBackService";
import { QaGroupSyncService } from "@/application/services/QaGroupSyncService";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import { ScanScopeService } from "@/application/services/ScanScopeService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import { toNoteIdKey, type CardState, type GroupBlockState, type PluginState } from "@/domain/manual-sync/entities/PluginState";
import type { RenderedSyncCard } from "@/domain/manual-sync/entities/RenderedSyncCard";
import { DiffPlannerService } from "@/domain/manual-sync/services/DiffPlannerService";
import { ManualCardRenderer, type ManualCardRenderContext } from "@/domain/manual-sync/services/ManualCardRenderer";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { getDeckResolutionWarningKey } from "@/domain/manual-sync/value-objects/DeckResolution";

import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

export class CurrentFileOutOfScopeError extends PluginUserError {
  constructor(filePath: string) {
    super("errors.currentFileOutOfScope", { filePath });
    this.name = "CurrentFileOutOfScopeError";
  }
}

export class RunScopeNotConfiguredError extends PluginUserError {
  constructor() {
    super("errors.runScopeNotConfigured");
    this.name = "RunScopeNotConfiguredError";
  }
}

export class ManualSyncService {
  private readonly scanScopeService = new ScanScopeService();
  private readonly qaGroupSyncService: QaGroupSyncService;
  private readonly renderConfigService: RenderConfigService;
  private readonly now: () => number;

  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly pluginStateRepository: PluginStateRepository,
    private readonly ankiGateway: AnkiGateway,
    private readonly fileIndexerService = new FileIndexerService(vaultGateway),
    private readonly diffPlannerService = new DiffPlannerService(),
    private readonly renderer = new ManualCardRenderer(),
    private readonly ankiBatchExecutor = new AnkiBatchExecutor(ankiGateway),
    private readonly markdownWriteBackService = new MarkdownWriteBackService(vaultGateway),
    renderConfigServiceOrNow: RenderConfigService | (() => number) = new RenderConfigService(),
    now: () => number = () => Date.now(),
  ) {
    this.qaGroupSyncService = new QaGroupSyncService(
      ankiGateway as AnkiGroupGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      this.vaultGateway.createBacklink.bind(this.vaultGateway),
    );

    if (isRenderConfigService(renderConfigServiceOrNow)) {
      this.renderConfigService = renderConfigServiceOrNow;
      this.now = now;
      return;
    }

    this.renderConfigService = new RenderConfigService();
    this.now = renderConfigServiceOrNow;
  }

  async syncVault(settings: PluginSettings): Promise<ManualSyncResult> {
    validatePluginSettings(settings);
    this.assertRunScopeConfigured(settings);
    const state = await this.pluginStateRepository.load();
    const indexResult = await this.fileIndexerService.indexVault(settings, state);
    return this.syncIndexedResult(indexResult, state, settings);
  }

  async syncFile(filePath: string, settings: PluginSettings): Promise<ManualSyncResult> {
    validatePluginSettings(settings);
    this.assertRunScopeConfigured(settings);
    if (!this.scanScopeService.isPathInScope(filePath, settings.scopeMode, settings.includeFolders, settings.excludeFolders)) {
      throw new CurrentFileOutOfScopeError(filePath);
    }

    const state = await this.pluginStateRepository.load();
    const indexResult = await this.fileIndexerService.indexFile(filePath, settings, state);
    return this.syncIndexedResult(indexResult, state, settings);
  }

  private assertRunScopeConfigured(settings: PluginSettings): void {
    if (!isRunScopeConfigured(settings.scopeMode, settings.includeFolders)) {
      throw new RunScopeNotConfiguredError();
    }
  }

  private async syncIndexedResult(
    indexResult: Awaited<ReturnType<FileIndexerService["indexVault"]>>,
    state: PluginState,
    settings: PluginSettings,
  ): Promise<ManualSyncResult> {
    const plan = this.diffPlannerService.plan(indexResult.cards, state, indexResult.scopedFilePaths, settings);
    const renderContext: ManualCardRenderContext = {
      addObsidianBacklink: settings.addObsidianBacklink,
      obsidianBacklinkLabel: settings.obsidianBacklinkLabel,
      obsidianBacklinkPlacement: settings.obsidianBacklinkPlacement,
      convertHighlightsToCloze: settings.convertHighlightsToCloze,
      keepPureTagLinesInCardBody: settings.keepPureTagLinesInCardBody,
      resourceResolver: this.vaultGateway,
    };
    const renderedCards = new Map<string, RenderedSyncCard>();

    for (const plannedCard of [...plan.toCreate, ...plan.toRebuild, ...plan.toUpdate]) {
      if (!renderedCards.has(plannedCard.card.syncKey)) {
        renderedCards.set(plannedCard.card.syncKey, this.renderer.render(plannedCard, renderContext));
      }
    }

    const executionResult = await this.ankiBatchExecutor.execute(
      plan,
      renderedCards,
      (plannedCard) => Promise.resolve(this.renderer.render(plannedCard, renderContext)),
      settings.noteFieldMappings,
    );
    const qaGroupExecution = await this.qaGroupSyncService.sync(indexResult.groupBlocks, state, settings);

    const indexedFilesByPath = new Map(indexResult.indexedFiles.map((file) => [file.filePath, file]));
    const writeBackResult = await this.markdownWriteBackService.write(executionResult.markerWrites, indexedFilesByPath, qaGroupExecution.markerWrites);
    const orphanGroupBlocks = collectOrphanGroupBlocks(state, indexResult.scopedFilePaths, qaGroupExecution.syncedGroupBlocks);

    const nextState = this.buildNextState(
      state,
      indexResult.cards,
      indexResult.indexedFiles,
      qaGroupExecution.syncedGroupBlocks,
      settings,
      new Set([...executionResult.touchedSyncKeys, ...qaGroupExecution.touchedSyncKeys, ...writeBackResult.writtenSyncKeys]),
      executionResult.resolvedNoteIds,
      plan.toOrphan,
      orphanGroupBlocks,
    );

    nextState.pendingWriteBack = [
      ...state.pendingWriteBack.filter((pending) => !new Set(indexResult.scopedFilePaths).has(pending.filePath)),
      ...writeBackResult.pendingEntries,
    ];
    this.markFilesDirty(nextState, [...writeBackResult.failureFiles.map((failure) => failure.filePath), ...writeBackResult.conflictFiles]);

    await this.pluginStateRepository.save(nextState);

    if (writeBackResult.failureFiles.length > 0) {
      throw this.createWriteBackFailureError(writeBackResult.failureFiles);
    }

    return {
      scannedFiles: indexResult.scannedFiles,
      scannedCards: indexResult.cards.length + indexResult.groupBlocks.length,
      created: executionResult.created + qaGroupExecution.created,
      rebuilt: executionResult.rebuilt,
      updated: executionResult.updated + qaGroupExecution.updated,
      migratedNoteTypes: executionResult.migratedNoteTypes + qaGroupExecution.migratedNoteTypes,
      migratedDecks: executionResult.migratedDecks + qaGroupExecution.migratedDecks,
      orphaned: plan.toOrphan.length + orphanGroupBlocks.length,
      uploadedMedia: executionResult.uploadedMedia,
      skippedUnchangedCards: indexResult.skippedUnchangedCards,
      rewrittenMarkers: writeBackResult.writtenSyncKeys.length,
      markerWriteConflictFiles: writeBackResult.conflictFiles,
      warnings: mergeDeckWarnings(plan.warnings, qaGroupExecution.warnings),
    };
  }

  private buildNextState(
    previousState: PluginState,
    cards: IndexedCard[],
    indexedFiles: Array<{ filePath: string; fileHash: string; fileStamp: string; content?: string; cards: IndexedCard[]; groupBlocks?: IndexedGroupCardBlock[] }>,
    syncedGroupBlocks: GroupBlockState[],
    settings: PluginSettings,
    touchedSyncKeys: Set<string>,
    resolvedNoteIds: Map<string, number | undefined>,
    orphanCards: CardState[],
    orphanGroupBlocks: GroupBlockState[],
  ): PluginState {
    const now = this.now();
    const deckRulesFingerprint = createDeckRulesFingerprint(settings);
    const scopedFilePaths = new Set(indexedFiles.filter((indexedFile) => indexedFile.content !== undefined).map((indexedFile) => indexedFile.filePath));
    const groupBlocksByFilePath = new Map<string, GroupBlockState[]>();
    for (const groupBlock of syncedGroupBlocks) {
      const entries = groupBlocksByFilePath.get(groupBlock.filePath);
      if (entries) {
        entries.push(groupBlock);
      } else {
        groupBlocksByFilePath.set(groupBlock.filePath, [groupBlock]);
      }
    }
    const nextState: PluginState = {
      files: { ...previousState.files },
      cards: { ...previousState.cards },
      groupBlocks: { ...(previousState.groupBlocks ?? {}) },
      pendingWriteBack: [...previousState.pendingWriteBack],
    };

    for (const filePath of scopedFilePaths) {
      delete nextState.files[filePath];
    }

    for (const [noteKey, cardState] of Object.entries(nextState.cards)) {
      if (scopedFilePaths.has(cardState.filePath)) {
        delete nextState.cards[noteKey];
      }
    }

    for (const [groupId, groupBlockState] of Object.entries(nextState.groupBlocks ?? {})) {
      if (scopedFilePaths.has(groupBlockState.filePath)) {
        delete nextState.groupBlocks?.[groupId];
      }
    }

    const resolvedNoteIdsBySyncKey = new Map<string, number>();

    for (const card of cards) {
      const noteId = resolvedNoteIds.get(card.syncKey) ?? card.noteId;
      if (noteId === undefined) {
        continue;
      }

      resolvedNoteIdsBySyncKey.set(card.syncKey, noteId);
    }

    for (const indexedFile of indexedFiles) {
      if (indexedFile.content === undefined) {
        continue;
      }

      const noteIds = Array.from(new Set(indexedFile.cards
        .map((card) => resolvedNoteIdsBySyncKey.get(card.syncKey))
        .filter((noteId): noteId is number => noteId !== undefined)));

      nextState.files[indexedFile.filePath] = {
        filePath: indexedFile.filePath,
        fileHash: indexedFile.fileHash,
        fileStamp: indexedFile.fileStamp,
        deckRulesFingerprint,
        lastIndexedAt: now,
        noteIds,
        groupIds: (groupBlocksByFilePath.get(indexedFile.filePath) ?? []).map((groupBlock) => groupBlock.groupId),
      };
    }

    for (const card of cards) {
      const noteId = resolvedNoteIdsBySyncKey.get(card.syncKey);
      if (noteId === undefined) {
        continue;
      }

      const existingState = previousState.cards[toNoteIdKey(noteId)] ?? (card.noteId !== undefined ? previousState.cards[toNoteIdKey(card.noteId)] : undefined);
      const renderPlan = this.renderConfigService.resolve(card, settings);

      nextState.cards[toNoteIdKey(noteId)] = {
        noteId,
        filePath: card.filePath,
        heading: card.heading,
        backlinkHeadingText: card.backlinkHeadingText,
        headingLevel: card.headingLevel,
        bodyMarkdown: card.bodyMarkdown,
        cardType: card.cardType,
        clozeMode: card.clozeMode,
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
        lastSyncedAt: touchedSyncKeys.has(card.syncKey) ? now : existingState?.lastSyncedAt ?? 0,
        orphan: false,
      };
    }

    for (const orphanCard of orphanCards) {
      nextState.cards[toNoteIdKey(orphanCard.noteId)] = {
        ...orphanCard,
        orphan: true,
      };
    }

    for (const groupBlock of syncedGroupBlocks) {
      nextState.groupBlocks ??= {};
      nextState.groupBlocks[groupBlock.groupId] = groupBlock;
    }

    for (const orphanGroupBlock of orphanGroupBlocks) {
      nextState.groupBlocks ??= {};
      nextState.groupBlocks[orphanGroupBlock.groupId] = {
        ...orphanGroupBlock,
        orphan: true,
      };
    }

    return nextState;
  }

  private markFilesDirty(nextState: PluginState, filePaths: string[]): void {
    for (const filePath of new Set(filePaths)) {
      if (nextState.files[filePath]) {
        nextState.files[filePath] = {
          ...nextState.files[filePath],
          fileHash: "",
          fileStamp: "",
        };
      }
    }
  }

  private createWriteBackFailureError(failures: PluginFileFailure[]): PluginUserError {
    return new PluginUserError("errors.writeBack.summary", {
      fileCount: failures.length,
    }, {
      failures,
    });
  }
}

function isRenderConfigService(value: RenderConfigService | (() => number)): value is RenderConfigService {
  return typeof value === "object" && value !== null && "resolve" in value;
}

function collectOrphanGroupBlocks(previousState: PluginState, scopedFilePaths: string[], syncedGroupBlocks: GroupBlockState[]): GroupBlockState[] {
  const scopedPaths = new Set(scopedFilePaths);
  const seenGroupIds = new Set(syncedGroupBlocks.map((groupBlock) => groupBlock.groupId));

  return Object.values(previousState.groupBlocks ?? {})
    .filter((groupBlock) => scopedPaths.has(groupBlock.filePath) && !seenGroupIds.has(groupBlock.groupId))
    .map((groupBlock) => ({ ...groupBlock, orphan: true }));
}

function mergeDeckWarnings(...warningGroups: DeckResolutionWarning[][]): DeckResolutionWarning[] {
  const warningMap = new Map<string, DeckResolutionWarning>();
  for (const warningGroup of warningGroups) {
    for (const warning of warningGroup) {
      warningMap.set(getDeckResolutionWarningKey(warning), warning);
    }
  }

  return [...warningMap.values()];
}
