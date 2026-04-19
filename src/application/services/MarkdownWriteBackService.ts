import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import type { PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import type { PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";
import { CardMarkerService, type MarkerWriteRequest } from "@/domain/manual-sync/services/CardMarkerService";

export interface MarkdownWriteBackResult {
  writtenSyncKeys: string[];
  conflictFiles: string[];
  failureFiles: Array<{ filePath: string; message: string }>;
  pendingEntries: PendingWriteBackState[];
}

export class MarkdownWriteBackService {
  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly markerService = new CardMarkerService(),
  ) {}

  async write(plannedCards: PlannedCard[], indexedFilesByPath: Map<string, IndexedFile>): Promise<MarkdownWriteBackResult> {
    const plannedByFile = new Map<string, PlannedCard[]>();
    const writtenSyncKeys: string[] = [];
    const conflictFiles: string[] = [];
    const failureFiles: Array<{ filePath: string; message: string }> = [];
    const pendingEntries: PendingWriteBackState[] = [];

    for (const plannedCard of plannedCards) {
      const entries = plannedByFile.get(plannedCard.card.filePath);
      if (entries) {
        entries.push(plannedCard);
        continue;
      }

      plannedByFile.set(plannedCard.card.filePath, [plannedCard]);
    }

    for (const [filePath, fileCards] of plannedByFile.entries()) {
      const indexedFile = indexedFilesByPath.get(filePath);
      const sourceContent = indexedFile?.content ?? fileCards[0]?.card.sourceContent;

      if (!sourceContent || !indexedFile) {
        pendingEntries.push(...fileCards.map((plannedCard) => this.createPendingEntry(filePath, plannedCard, indexedFile?.fileHash ?? "")));
        failureFiles.push({ filePath, message: `Missing scanned source content for ${filePath}.` });
        continue;
      }

      try {
        const nextContent = this.markerService.applyBatch(
          sourceContent,
          fileCards.map((plannedCard) => this.toWriteRequest(plannedCard, sourceContent)),
        );

        await this.vaultGateway.replaceMarkdownFile(filePath, sourceContent, nextContent);
        writtenSyncKeys.push(...fileCards.map((plannedCard) => plannedCard.card.syncKey));
      } catch (error) {
        pendingEntries.push(...fileCards.map((plannedCard) => this.createPendingEntry(filePath, plannedCard, indexedFile.fileHash)));

        if (error instanceof MarkdownWriteConflictError) {
          conflictFiles.push(filePath);
          continue;
        }

        failureFiles.push({
          filePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      writtenSyncKeys,
      conflictFiles,
      failureFiles,
      pendingEntries,
    };
  }

  private toWriteRequest(plannedCard: PlannedCard, sourceContent: string): MarkerWriteRequest {
    return {
      filePath: plannedCard.card.filePath,
      noteId: requireNoteId(plannedCard),
      blockStartLine: plannedCard.card.blockStartLine,
      contentEndLine: plannedCard.card.contentEndLine,
      blockEndLine: plannedCard.card.blockEndLine,
      markerLine: plannedCard.card.markerLine,
      markerIndent: plannedCard.card.markerIndent,
      sourceContent,
    };
  }

  private createPendingEntry(filePath: string, plannedCard: PlannedCard, expectedFileHash: string): PendingWriteBackState {
    const noteId = requireNoteId(plannedCard);

    return {
      filePath,
      blockStartLine: plannedCard.card.blockStartLine,
      expectedFileHash,
      targetMarker: this.markerService.create(noteId).raw,
      rawBlockHash: plannedCard.card.rawBlockHash,
      targetNoteId: noteId,
    };
  }
}

function requireNoteId(plannedCard: PlannedCard): number {
  if (plannedCard.noteId === undefined) {
    throw new Error(`Cannot write marker without noteId for block ${plannedCard.card.filePath}:${plannedCard.card.blockStartLine}.`);
  }

  return plannedCard.noteId;
}