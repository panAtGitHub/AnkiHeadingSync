import type { PluginSettings } from "@/application/config/PluginSettings";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import { ScanScopeService } from "@/application/services/ScanScopeService";
import { createIndexedCardSyncKey, normalizeStoredClozeMode, type IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { buildGroupSrc, createIndexedGroupSyncKey, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import { toNoteIdKey, type CardState, type GroupBlockState, type PendingWriteBackState, type PluginState } from "@/domain/manual-sync/entities/PluginState";
import { CardIndexingService } from "@/domain/manual-sync/services/CardIndexingService";
import { hashString } from "@/domain/shared/hash";

export interface FileIndexerResult {
  scopedFilePaths: string[];
  scannedFiles: number;
  indexedFiles: IndexedFile[];
  cards: IndexedCard[];
  groupBlocks: IndexedGroupCardBlock[];
  skippedUnchangedFiles: number;
  skippedUnchangedCards: number;
}

interface StateIndex {
  cardsByFilePath: Map<string, CardState[]>;
  groupBlocksByFilePath: Map<string, GroupBlockState[]>;
  pendingByFilePath: Map<string, PendingWriteBackState[]>;
}

export class FileIndexerService {
  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly scanScopeService = new ScanScopeService(),
    private readonly cardIndexingService = new CardIndexingService(),
  ) {}

  async indexVault(settings: PluginSettings, state: PluginState, forceReadAll = false): Promise<FileIndexerResult> {
    const refs = this.scanScopeService.filter(
      await this.vaultGateway.listMarkdownFileRefs(),
      settings.scopeMode,
      settings.includeFolders,
      settings.excludeFolders,
    );
    return this.indexRefs(refs, settings, state, this.buildStateIndex(state), forceReadAll);
  }

  async indexFile(filePath: string, settings: PluginSettings, state: PluginState): Promise<FileIndexerResult> {
    const refs = await this.vaultGateway.listMarkdownFileRefs();
    const reference = refs.find((entry) => entry.path === filePath);
    const sourceFile = await this.vaultGateway.readMarkdownFile(filePath);

    if (!sourceFile) {
      throw new Error(`Markdown file not found: ${filePath}`);
    }

    const fileStamp = reference ? createFileStamp(reference.mtime, reference.size) : `${Date.now()}:${sourceFile.content.length}`;
    const stateIndex = this.buildStateIndex(state);
    const indexedFile = this.cardIndexingService.index(sourceFile, {
      cardTypeConfigs: settings.cardTypeConfigs,
      cardAnswerCutoffMode: settings.cardAnswerCutoffMode,
      syncObsidianTagsToAnki: settings.syncObsidianTagsToAnki,
      fileStamp,
      knownCards: stateIndex.cardsByFilePath.get(filePath) ?? [],
      knownGroupBlocks: stateIndex.groupBlocksByFilePath.get(filePath) ?? [],
      pendingWriteBack: stateIndex.pendingByFilePath.get(filePath) ?? [],
      fileDeckEnabled: settings.fileDeckEnabled,
      fileDeckMarker: settings.fileDeckMarker,
    });

    return {
      scopedFilePaths: [filePath],
      scannedFiles: 1,
      indexedFiles: [indexedFile],
      cards: indexedFile.cards,
      groupBlocks: indexedFile.groupBlocks ?? [],
      skippedUnchangedFiles: 0,
      skippedUnchangedCards: 0,
    };
  }

  private async indexRefs(
    refs: Awaited<ReturnType<ManualSyncVaultGateway["listMarkdownFileRefs"]>>,
    settings: PluginSettings,
    state: PluginState,
    stateIndex: StateIndex,
    forceReadAll: boolean,
  ): Promise<FileIndexerResult> {
    const indexedFiles: IndexedFile[] = [];
    const cards: IndexedCard[] = [];
    const groupBlocks: IndexedGroupCardBlock[] = [];
    let skippedUnchangedFiles = 0;
    let skippedUnchangedCards = 0;
    const deckRulesFingerprint = createDeckRulesFingerprint(settings);

    for (const ref of refs) {
      const fileStamp = createFileStamp(ref.mtime, ref.size);
      const existingFileState = state.files[ref.path];
      const pendingWriteBack = stateIndex.pendingByFilePath.get(ref.path) ?? [];
      const hasPendingWriteBack = pendingWriteBack.length > 0;
      const knownCards = stateIndex.cardsByFilePath.get(ref.path) ?? [];
      const hasMissingKnownCard = (existingFileState?.noteIds ?? []).some((noteId) => !state.cards[toNoteIdKey(noteId)]);
      const hasStaleClozeAllMode = hasCachedClozeAllMarkerWithoutAllMode(knownCards, settings);
      const shouldRead =
        forceReadAll ||
        hasPendingWriteBack ||
        !existingFileState ||
        existingFileState.fileStamp !== fileStamp ||
        existingFileState.deckRulesFingerprint !== deckRulesFingerprint ||
        hasStaleClozeAllMode ||
        hasMissingKnownCard;

      if (!shouldRead) {
        skippedUnchangedFiles += 1;
        const restoredGroups = (existingFileState?.groupIds ?? [])
          .map((groupId) => state.groupBlocks?.[groupId])
          .filter((groupBlock): groupBlock is GroupBlockState => Boolean(groupBlock))
          .map((groupBlock) => restoreIndexedGroupBlock(groupBlock));
        skippedUnchangedCards += (existingFileState?.noteIds ?? []).length + restoredGroups.length;
        const restoredCards = (existingFileState?.noteIds ?? [])
          .map((noteId) => state.cards[toNoteIdKey(noteId)])
          .filter((card): card is CardState => Boolean(card))
          .map((card) => restoreIndexedCard(card));

        indexedFiles.push({
          filePath: ref.path,
          fileHash: existingFileState?.fileHash ?? "",
          fileStamp,
          cards: restoredCards,
          groupBlocks: restoredGroups,
        });
        cards.push(...restoredCards);
        groupBlocks.push(...restoredGroups);
        continue;
      }

      const sourceFile = await this.vaultGateway.readMarkdownFile(ref.path);
      if (!sourceFile) {
        continue;
      }

      const indexedFile = this.cardIndexingService.index(sourceFile, {
        cardTypeConfigs: settings.cardTypeConfigs,
        cardAnswerCutoffMode: settings.cardAnswerCutoffMode,
        syncObsidianTagsToAnki: settings.syncObsidianTagsToAnki,
        fileStamp,
        knownCards,
        knownGroupBlocks: stateIndex.groupBlocksByFilePath.get(ref.path) ?? [],
        pendingWriteBack,
        fileDeckEnabled: settings.fileDeckEnabled,
        fileDeckMarker: settings.fileDeckMarker,
      });

      indexedFiles.push(indexedFile);
      cards.push(...indexedFile.cards);
      groupBlocks.push(...(indexedFile.groupBlocks ?? []));
    }

    return {
      scopedFilePaths: refs.map((ref) => ref.path),
      scannedFiles: refs.length,
      indexedFiles,
      cards,
      groupBlocks,
      skippedUnchangedFiles,
      skippedUnchangedCards,
    };
  }

  private buildStateIndex(state: PluginState): StateIndex {
    const cardsByFilePath = new Map<string, CardState[]>();
    const groupBlocksByFilePath = new Map<string, GroupBlockState[]>();
    const pendingByFilePath = new Map<string, PendingWriteBackState[]>();

    for (const card of Object.values(state.cards)) {
      const cards = cardsByFilePath.get(card.filePath);
      if (cards) {
        cards.push(card);
        continue;
      }

      cardsByFilePath.set(card.filePath, [card]);
    }

    for (const groupBlock of Object.values(state.groupBlocks ?? {})) {
      const groupBlocks = groupBlocksByFilePath.get(groupBlock.filePath);
      if (groupBlocks) {
        groupBlocks.push(groupBlock);
        continue;
      }

      groupBlocksByFilePath.set(groupBlock.filePath, [groupBlock]);
    }

    for (const pending of state.pendingWriteBack) {
      const pendings = pendingByFilePath.get(pending.filePath);
      if (pendings) {
        pendings.push(pending);
        continue;
      }

      pendingByFilePath.set(pending.filePath, [pending]);
    }

    return {
      cardsByFilePath,
      groupBlocksByFilePath,
      pendingByFilePath,
    };
  }
}

function restoreIndexedCard(card: CardState): IndexedCard {
  return {
    noteId: card.noteId,
    syncKey: createIndexedCardSyncKey(card.filePath, card.blockStartLine, card.rawBlockHash),
    idMarkerState: "present-valid",
    noteIdSource: "marker",
    filePath: card.filePath,
    cardType: card.cardType,
    clozeMode: normalizeStoredClozeMode(card.cardType, card.clozeMode),
    heading: card.heading,
    backlinkHeadingText: card.backlinkHeadingText,
    headingLevel: card.headingLevel,
    bodyMarkdown: card.bodyMarkdown,
    blockStartOffset: card.blockStartOffset,
    blockEndOffset: card.blockEndOffset,
    blockStartLine: card.blockStartLine,
    bodyStartLine: card.bodyStartLine,
    blockEndLine: card.blockEndLine,
    contentEndLine: card.contentEndLine,
    markerLine: card.markerLine,
    rawBlockText: card.rawBlockText,
    rawBlockHash: card.rawBlockHash,
    deckHint: card.deckHint,
    deckHintSource: card.deckHintSource,
    deckWarnings: [...card.deckWarnings],
    tagsHint: card.tagsHint,
  };
}

function hasCachedClozeAllMarkerWithoutAllMode(cards: CardState[], settings: PluginSettings): boolean {
  const clozeAllConfig = settings.cardTypeConfigs["cloze-all"];
  const marker = clozeAllConfig.enabled ? clozeAllConfig.extraMarker.trim() : "";
  if (marker.length === 0) {
    return false;
  }

  return cards.some((card) => {
    if (card.cardType !== "cloze" || normalizeStoredClozeMode(card.cardType, card.clozeMode) === "all") {
      return false;
    }

    return card.heading.trimEnd().endsWith(marker) || getRawHeading(card.rawBlockText).trimEnd().endsWith(marker);
  });
}

function getRawHeading(rawBlockText: string): string {
  return rawBlockText.split(/\r?\n/, 1)[0] ?? "";
}

function restoreIndexedGroupBlock(groupBlock: GroupBlockState): IndexedGroupCardBlock {
  return {
    noteId: groupBlock.noteId,
    groupId: groupBlock.groupId,
    syncKey: createIndexedGroupSyncKey(groupBlock.filePath, groupBlock.blockStartLine, groupBlock.rawBlockHash),
    markerState: "present-valid",
    identitySource: "state-recovery",
    filePath: groupBlock.filePath,
    headingText: groupBlock.headingText,
    backlinkHeadingText: groupBlock.backlinkHeadingText,
    headingLevel: groupBlock.headingLevel,
    stem: groupBlock.stem,
    src: groupBlock.src || buildGroupSrc(groupBlock.filePath, groupBlock.backlinkHeadingText),
    blockStartOffset: groupBlock.blockStartOffset,
    blockEndOffset: groupBlock.blockEndOffset,
    blockStartLine: groupBlock.blockStartLine,
    bodyStartLine: groupBlock.bodyStartLine,
    blockEndLine: groupBlock.blockEndLine,
    contentEndLine: groupBlock.contentEndLine,
    markerLine: groupBlock.markerLine,
    markerIndent: groupBlock.markerIndent,
    rawBlockText: groupBlock.rawBlockText,
    rawBlockHash: groupBlock.rawBlockHash,
    deckHint: groupBlock.deckHint,
    deckHintSource: groupBlock.deckHintSource,
    deckWarnings: [...groupBlock.deckWarnings],
    tagsHint: groupBlock.tagsHint ? [...groupBlock.tagsHint] : [],
    items: groupBlock.items.map((item) => ({ ...item })),
    freeSlots: [...groupBlock.freeSlots],
  };
}

export function createFileStamp(mtime: number, size: number): string {
  return `${mtime}:${size}`;
}

const DECK_RULES_FINGERPRINT_VERSION = "deck-rules-v5";

export function createDeckRulesFingerprint(settings: PluginSettings): string {
  return hashString(JSON.stringify({
    version: DECK_RULES_FINGERPRINT_VERSION,
    cardTypeConfigs: settings.cardTypeConfigs,
    cardAnswerCutoffMode: settings.cardAnswerCutoffMode,
    defaultDeck: settings.defaultDeck,
    fileDeckEnabled: settings.fileDeckEnabled,
    fileDeckMarker: settings.fileDeckMarker,
    folderDeckMode: settings.folderDeckMode,
    alternateFolderDeckModeFolders: [...settings.alternateFolderDeckModeFolders].sort(),
    syncObsidianTagsToAnki: settings.syncObsidianTagsToAnki,
    keepPureTagLinesInCardBody: settings.keepPureTagLinesInCardBody,
  }));
}
