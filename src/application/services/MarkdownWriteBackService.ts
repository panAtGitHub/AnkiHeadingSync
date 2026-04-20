import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import type { PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import type { PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";
import { CardMarkerService, type MarkerWriteRequest } from "@/domain/manual-sync/services/CardMarkerService";
import { GroupMarkerService, type GroupMarkerWriteRequest, serializeGroupMarker } from "@/domain/manual-sync/services/GroupMarkerService";

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
    private readonly groupMarkerService = new GroupMarkerService(),
  ) {}

  async write(
    plannedCards: PlannedCard[],
    indexedFilesByPath: Map<string, IndexedFile>,
    groupWrites: GroupMarkerWriteRequest[] = [],
  ): Promise<MarkdownWriteBackResult> {
    const plannedByFile = new Map<string, Array<{ kind: "card"; plannedCard: PlannedCard } | { kind: "group"; write: GroupMarkerWriteRequest }>>();
    const writtenSyncKeys: string[] = [];
    const conflictFiles: string[] = [];
    const failureFiles: Array<{ filePath: string; message: string }> = [];
    const pendingEntries: PendingWriteBackState[] = [];

    for (const plannedCard of plannedCards) {
      const entries = plannedByFile.get(plannedCard.card.filePath);
      if (entries) {
        entries.push({ kind: "card", plannedCard });
        continue;
      }

      plannedByFile.set(plannedCard.card.filePath, [{ kind: "card", plannedCard }]);
    }

    for (const groupWrite of groupWrites) {
      const entries = plannedByFile.get(groupWrite.filePath);
      if (entries) {
        entries.push({ kind: "group", write: groupWrite });
        continue;
      }

      plannedByFile.set(groupWrite.filePath, [{ kind: "group", write: groupWrite }]);
    }

    for (const [filePath, fileWrites] of plannedByFile.entries()) {
      const indexedFile = indexedFilesByPath.get(filePath);
      const sourceContent = indexedFile?.content ?? resolveSourceContent(fileWrites[0]);

      if (!sourceContent || !indexedFile) {
        pendingEntries.push(...fileWrites.map((fileWrite) => this.createPendingEntry(filePath, fileWrite, indexedFile?.fileHash ?? "")));
        failureFiles.push({ filePath, message: `Missing scanned source content for ${filePath}.` });
        continue;
      }

      try {
        const cardWrites = fileWrites.flatMap((fileWrite) => fileWrite.kind === "card" ? [this.toWriteRequest(fileWrite.plannedCard, sourceContent)] : []);
        const resolvedGroupWrites = fileWrites.flatMap((fileWrite) => fileWrite.kind === "group" ? [fileWrite.write] : []);
        this.markerService.validateBatch(sourceContent, cardWrites);
        this.groupMarkerService.validateBatch(sourceContent, resolvedGroupWrites);

        const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
        const lines = sourceContent.split(/\r?\n/);
        const orderedWrites = [
          ...cardWrites.map((write) => ({ kind: "card" as const, blockStartLine: write.blockStartLine, write })),
          ...resolvedGroupWrites.map((write) => ({ kind: "group" as const, blockStartLine: write.blockStartLine, write })),
        ].sort((left, right) => right.blockStartLine - left.blockStartLine || (left.kind === right.kind ? 0 : left.kind === "group" ? -1 : 1));

        for (const orderedWrite of orderedWrites) {
          if (orderedWrite.kind === "card") {
            this.markerService.applyWrite(lines, orderedWrite.write);
            continue;
          }

          this.groupMarkerService.applyWrite(lines, orderedWrite.write);
        }

        const nextContent = lines.join(lineEnding);

        await this.vaultGateway.replaceMarkdownFile(filePath, sourceContent, nextContent);
        writtenSyncKeys.push(...fileWrites.map((fileWrite) => fileWrite.kind === "card" ? fileWrite.plannedCard.card.syncKey : fileWrite.write.syncKey));
      } catch (error) {
        pendingEntries.push(...fileWrites.map((fileWrite) => this.createPendingEntry(filePath, fileWrite, indexedFile.fileHash)));

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

  private createPendingEntry(
    filePath: string,
    fileWrite: { kind: "card"; plannedCard: PlannedCard } | { kind: "group"; write: GroupMarkerWriteRequest },
    expectedFileHash: string,
  ): PendingWriteBackState {
    if (fileWrite.kind === "card") {
      const noteId = requireNoteId(fileWrite.plannedCard);
      return {
        filePath,
        blockStartLine: fileWrite.plannedCard.card.blockStartLine,
        expectedFileHash,
        targetMarker: this.markerService.create(noteId).raw,
        rawBlockHash: fileWrite.plannedCard.card.rawBlockHash,
        targetNoteId: noteId,
        markerKind: "card-id",
      };
    }

    return {
      filePath,
      blockStartLine: fileWrite.write.blockStartLine,
      expectedFileHash,
      targetMarker: serializeGroupMarker(fileWrite.write.noteId, fileWrite.write.itemToSlot, fileWrite.write.freeSlots),
      rawBlockHash: getRawBlockHashFromSyncKey(fileWrite.write.syncKey),
      targetNoteId: fileWrite.write.noteId,
      markerKind: "group-gi",
      targetGroupId: fileWrite.write.groupId,
    };
  }
}

function resolveSourceContent(fileWrite: { kind: "card"; plannedCard: PlannedCard } | { kind: "group"; write: GroupMarkerWriteRequest } | undefined): string | undefined {
  if (!fileWrite) {
    return undefined;
  }

  return fileWrite.kind === "card" ? fileWrite.plannedCard.card.sourceContent : fileWrite.write.sourceContent;
}

function getRawBlockHashFromSyncKey(syncKey: string): string {
  return syncKey.split("\u0000").at(-1) ?? "";
}

function requireNoteId(plannedCard: PlannedCard): number {
  if (plannedCard.noteId === undefined) {
    throw new Error(`Cannot write marker without noteId for block ${plannedCard.card.filePath}:${plannedCard.card.blockStartLine}.`);
  }

  return plannedCard.noteId;
}