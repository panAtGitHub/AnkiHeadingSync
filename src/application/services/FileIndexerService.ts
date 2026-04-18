import type { PluginSettings } from "@/application/config/PluginSettings";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import { ScanScopeService } from "@/application/services/ScanScopeService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import type { CardState, PendingWriteBackState, PluginState } from "@/domain/manual-sync/entities/PluginState";
import { CardIndexingService } from "@/domain/manual-sync/services/CardIndexingService";

export interface FileIndexerResult {
  scopedFilePaths: string[];
  scannedFiles: number;
  indexedFiles: IndexedFile[];
  cards: IndexedCard[];
  skippedUnchangedFiles: number;
  skippedUnchangedCards: number;
}

interface StateIndex {
  cardsByFilePath: Map<string, CardState[]>;
  pendingByFilePath: Map<string, PendingWriteBackState[]>;
}

export class FileIndexerService {
  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly scanScopeService = new ScanScopeService(),
    private readonly cardIndexingService = new CardIndexingService(),
  ) {}

  async indexVault(settings: PluginSettings, state: PluginState, forceReadAll = false): Promise<FileIndexerResult> {
    const refs = this.scanScopeService.filter(await this.vaultGateway.listMarkdownFileRefs(), settings.includeFolders, settings.excludeFolders);
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
      qaHeadingLevel: settings.qaHeadingLevel,
      clozeHeadingLevel: settings.clozeHeadingLevel,
      fileStamp,
      knownCards: stateIndex.cardsByFilePath.get(filePath) ?? [],
      pendingWriteBack: stateIndex.pendingByFilePath.get(filePath) ?? [],
    });

    return {
      scopedFilePaths: [filePath],
      scannedFiles: 1,
      indexedFiles: [indexedFile],
      cards: indexedFile.cards,
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
    let skippedUnchangedFiles = 0;
    let skippedUnchangedCards = 0;

    for (const ref of refs) {
      const fileStamp = createFileStamp(ref.mtime, ref.size);
      const existingFileState = state.files[ref.path];
      const pendingWriteBack = stateIndex.pendingByFilePath.get(ref.path) ?? [];
      const hasPendingWriteBack = pendingWriteBack.length > 0;
      const knownCards = stateIndex.cardsByFilePath.get(ref.path) ?? [];
      const hasMissingKnownCard = existingFileState?.cardIds.some((cardId) => !state.cards[cardId]) ?? false;
      const shouldRead =
        forceReadAll ||
        hasPendingWriteBack ||
        !existingFileState ||
        existingFileState.fileStamp !== fileStamp ||
        hasMissingKnownCard;

      if (!shouldRead) {
        skippedUnchangedFiles += 1;
        skippedUnchangedCards += existingFileState?.cardIds.length ?? 0;
        const restoredCards = (existingFileState?.cardIds ?? [])
          .map((cardId) => state.cards[cardId])
          .filter((card): card is CardState => Boolean(card))
          .map((card) => restoreIndexedCard(card));

        indexedFiles.push({
          filePath: ref.path,
          fileHash: existingFileState?.fileHash ?? "",
          fileStamp,
          cards: restoredCards,
        });
        cards.push(...restoredCards);
        continue;
      }

      const sourceFile = await this.vaultGateway.readMarkdownFile(ref.path);
      if (!sourceFile) {
        continue;
      }

      const indexedFile = this.cardIndexingService.index(sourceFile, {
        qaHeadingLevel: settings.qaHeadingLevel,
        clozeHeadingLevel: settings.clozeHeadingLevel,
        fileStamp,
        knownCards,
        pendingWriteBack,
      });

      indexedFiles.push(indexedFile);
      cards.push(...indexedFile.cards);
    }

    return {
      scopedFilePaths: refs.map((ref) => ref.path),
      scannedFiles: refs.length,
      indexedFiles,
      cards,
      skippedUnchangedFiles,
      skippedUnchangedCards,
    };
  }

  private buildStateIndex(state: PluginState): StateIndex {
    const cardsByFilePath = new Map<string, CardState[]>();
    const pendingByFilePath = new Map<string, PendingWriteBackState[]>();

    for (const card of Object.values(state.cards)) {
      const cards = cardsByFilePath.get(card.filePath);
      if (cards) {
        cards.push(card);
        continue;
      }

      cardsByFilePath.set(card.filePath, [card]);
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
      pendingByFilePath,
    };
  }
}

function restoreIndexedCard(card: CardState): IndexedCard {
  return {
    cardId: card.cardId,
    noteId: card.noteId,
    markerNoteId: card.noteId,
    filePath: card.filePath,
    cardType: card.cardType,
    heading: card.heading,
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
    tagsHint: card.tagsHint,
    markerState: card.noteId ? "card-and-note" : "card-only",
  };
}

export function createFileStamp(mtime: number, size: number): string {
  return `${mtime}:${size}`;
}