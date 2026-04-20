import type { PluginSettings } from "@/application/config/PluginSettings";
import { validatePluginSettings } from "@/application/config/PluginSettings";
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
import { GroupMarkerService, type GroupMarkerWriteRequest } from "@/domain/manual-sync/services/GroupMarkerService";
import { DiffPlannerService } from "@/domain/manual-sync/services/DiffPlannerService";
import { ManualCardRenderer, type ManualCardRenderContext } from "@/domain/manual-sync/services/ManualCardRenderer";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { getDeckResolutionWarningKey } from "@/domain/manual-sync/value-objects/DeckResolution";

import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

export class CurrentFileOutOfScopeError extends Error {
  constructor(filePath: string) {
    super(`当前文件不在插件作用范围内: ${filePath}`);
    this.name = "CurrentFileOutOfScopeError";
  }
}

export class ManualSyncService {
  private readonly scanScopeService = new ScanScopeService();
  private readonly qaGroupSyncService: QaGroupSyncService;
  private readonly groupMarkerService: GroupMarkerService;
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
    this.groupMarkerService = new GroupMarkerService();

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
    const markerWrites = plan.toRewriteMarker.filter((plannedCard) => plannedCard.noteId !== undefined);
    const rebuildGroupResult = this.buildReindexedGroupStates(indexResult.groupBlocks, state);

    const writeBackResult = await this.markdownWriteBackService.write(markerWrites, indexedFilesByPath, rebuildGroupResult.markerWrites);
    const orphanGroupBlocks = collectOrphanGroupBlocks(state, indexResult.scopedFilePaths, rebuildGroupResult.syncedGroupBlocks);
    const nextState = this.buildNextState(
      state,
      indexResult.cards,
      indexResult.indexedFiles,
      rebuildGroupResult.syncedGroupBlocks,
      settings,
      new Set(writeBackResult.writtenSyncKeys),
      new Map(),
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
      throw new Error(this.createWriteBackFailureMessage(writeBackResult.failureFiles));
    }

    return {
      scannedFiles: indexResult.scannedFiles,
      scannedCards: indexResult.cards.length + indexResult.groupBlocks.length,
      created: 0,
      updated: 0,
      migratedDecks: 0,
      orphaned: plan.toOrphan.length + orphanGroupBlocks.length,
      uploadedMedia: 0,
      skippedUnchangedCards: indexResult.skippedUnchangedCards,
      rewrittenMarkers: writeBackResult.writtenSyncKeys.length,
      markerWriteConflictFiles: writeBackResult.conflictFiles,
      warnings: mergeDeckWarnings(plan.warnings, rebuildGroupResult.warnings),
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
      if (!renderedCards.has(plannedCard.card.syncKey)) {
        renderedCards.set(plannedCard.card.syncKey, this.renderer.render(plannedCard, renderContext));
      }
    }

    const executionResult = await this.ankiBatchExecutor.execute(
      plan,
      renderedCards,
      async (plannedCard) => this.renderer.render(plannedCard, renderContext),
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
      throw new Error(this.createWriteBackFailureMessage(writeBackResult.failureFiles));
    }

    return {
      scannedFiles: indexResult.scannedFiles,
      scannedCards: indexResult.cards.length + indexResult.groupBlocks.length,
      created: executionResult.created + qaGroupExecution.created,
      updated: executionResult.updated + qaGroupExecution.updated,
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

  private buildReindexedGroupStates(
    groupBlocks: IndexedGroupCardBlock[],
    state: PluginState,
  ): { syncedGroupBlocks: GroupBlockState[]; markerWrites: GroupMarkerWriteRequest[]; warnings: DeckResolutionWarning[] } {
    const syncedGroupBlocks: GroupBlockState[] = [];
    const markerWrites: GroupMarkerWriteRequest[] = [];
    const warnings: DeckResolutionWarning[] = [];
    const byNoteId = new Map<number, GroupBlockState>(Object.values(state.groupBlocks ?? {})
      .filter((groupBlock) => !groupBlock.orphan)
      .map((groupBlock) => [groupBlock.noteId, groupBlock]));
    const bySrc = new Map<string, GroupBlockState[]>();

    for (const groupBlock of Object.values(state.groupBlocks ?? {}).filter((entry) => !entry.orphan)) {
      const entries = bySrc.get(groupBlock.src);
      if (entries) {
        entries.push(groupBlock);
      } else {
        bySrc.set(groupBlock.src, [groupBlock]);
      }
    }

    for (const block of groupBlocks) {
      const existingState = (block.groupId ? state.groupBlocks?.[block.groupId] : undefined)
        ?? (block.noteId !== undefined ? byNoteId.get(block.noteId) : undefined)
        ?? uniqueGroupStateMatch(bySrc.get(block.src));
      if (!existingState) {
        continue;
      }

      const itemToSlot = Object.fromEntries(existingState.items
        .filter((item) => item.itemId && item.slot)
        .map((item) => [item.itemId as string, item.slot as number]));

      syncedGroupBlocks.push({
        ...existingState,
        filePath: block.filePath,
        headingText: block.headingText,
        backlinkHeadingText: block.backlinkHeadingText,
        headingLevel: block.headingLevel,
        stem: block.stem,
        src: block.src,
        blockStartOffset: block.blockStartOffset,
        blockEndOffset: block.blockEndOffset,
        blockStartLine: block.blockStartLine,
        bodyStartLine: block.bodyStartLine,
        blockEndLine: block.blockEndLine,
        contentEndLine: block.contentEndLine,
        markerLine: block.markerLine,
        markerIndent: block.markerIndent,
        rawBlockText: block.rawBlockText,
        rawBlockHash: block.rawBlockHash,
        deckHint: block.deckHint,
        deckHintSource: block.deckHintSource,
        deckWarnings: [...block.deckWarnings],
        orphan: false,
      });

      warnings.push(...block.deckWarnings);

      if (
        block.sourceContent
        && (
          block.markerState !== "present-valid"
          || !this.groupMarkerService.isEquivalent(block.groupMarker, existingState.noteId, itemToSlot, existingState.freeSlots)
          || hasLegacyInnerIdMarkers(block)
        )
      ) {
        markerWrites.push({
          syncKey: block.syncKey,
          filePath: block.filePath,
          blockStartLine: block.blockStartLine,
          contentEndLine: block.contentEndLine,
          blockEndLine: block.blockEndLine,
          markerLine: block.markerLine,
          markerIndent: block.markerIndent,
          noteId: existingState.noteId,
          groupId: existingState.groupId,
          itemToSlot,
          freeSlots: [...existingState.freeSlots],
          sourceContent: block.sourceContent,
        });
      }
    }

    return {
      syncedGroupBlocks,
      markerWrites,
      warnings,
    };
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

  private createWriteBackFailureMessage(failures: Array<{ filePath: string; message: string }>): string {
    return `Markdown marker write-back failed for ${failures.length} file(s).\n${failures.map((failure) => `${failure.filePath}: ${failure.message}`).join("\n")}`;
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

function uniqueGroupStateMatch(groupBlocks: GroupBlockState[] | undefined): GroupBlockState | undefined {
  if (!groupBlocks || groupBlocks.length !== 1) {
    return undefined;
  }

  return groupBlocks[0];
}

function hasLegacyInnerIdMarkers(block: IndexedGroupCardBlock): boolean {
  if (!block.sourceContent) {
    return false;
  }

  const lines = block.sourceContent.split(/\r?\n/);
  for (let lineIndex = block.blockStartLine; lineIndex < block.blockEndLine; lineIndex += 1) {
    if (/^\s*<!--\s*ID:/i.test(lines[lineIndex] ?? "")) {
      return true;
    }
  }

  return false;
}
