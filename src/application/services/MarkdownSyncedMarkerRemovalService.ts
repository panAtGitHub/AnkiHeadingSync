import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import { CardMarkerService } from "@/domain/manual-sync/services/CardMarkerService";
import { GroupMarkerService } from "@/domain/manual-sync/services/GroupMarkerService";

export interface SyncedCardMarkerRemovalTarget {
  noteId: number;
}

export interface SyncedGroupMarkerRemovalTarget {
  noteId: number;
  groupId: string;
  blockStartLine: number;
}

export interface MarkdownSyncedMarkerRemovalResult {
  removedCardMarkers: number;
  removedGroupMarkers: number;
  removedMarkers: number;
  conflictFiles: string[];
  failureFiles: Array<{ filePath: string; message: string }>;
}

export class MarkdownSyncedMarkerRemovalService {
  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly cardMarkerService = new CardMarkerService(),
    private readonly groupMarkerService = new GroupMarkerService(),
  ) {}

  async remove(
    filePath: string,
    cardTargets: SyncedCardMarkerRemovalTarget[],
    groupTargets: SyncedGroupMarkerRemovalTarget[],
  ): Promise<MarkdownSyncedMarkerRemovalResult> {
    if (cardTargets.length === 0 && groupTargets.length === 0) {
      return createEmptyRemovalResult();
    }

    const sourceFile = await this.vaultGateway.readMarkdownFile(filePath);
    if (!sourceFile) {
      return {
        ...createEmptyRemovalResult(),
        failureFiles: [{ filePath, message: `Markdown file not found: ${filePath}` }],
      };
    }

    const removal = applyMarkerRemoval(
      sourceFile.content,
      new Set(cardTargets.map((target) => target.noteId)),
      new Set(groupTargets.map((target) => target.noteId)),
      this.cardMarkerService,
      this.groupMarkerService,
    );

    try {
      if (removal.nextContent !== sourceFile.content) {
        await this.vaultGateway.replaceMarkdownFile(filePath, sourceFile.content, removal.nextContent);
      }

      return {
        removedCardMarkers: removal.removedCardMarkers,
        removedGroupMarkers: removal.removedGroupMarkers,
        removedMarkers: removal.removedCardMarkers + removal.removedGroupMarkers,
        conflictFiles: [],
        failureFiles: [],
      };
    } catch (error) {
      if (error instanceof MarkdownWriteConflictError) {
        return {
          ...createEmptyRemovalResult(),
          conflictFiles: [filePath],
        };
      }

      return {
        ...createEmptyRemovalResult(),
        failureFiles: [{
          filePath,
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }
}

interface AppliedMarkerRemoval {
  nextContent: string;
  removedCardMarkers: number;
  removedGroupMarkers: number;
}

function applyMarkerRemoval(
  sourceContent: string,
  cardNoteIds: Set<number>,
  groupNoteIds: Set<number>,
  cardMarkerService: CardMarkerService,
  groupMarkerService: GroupMarkerService,
): AppliedMarkerRemoval {
  const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = sourceContent.split(/\r?\n/);
  const nextLines: string[] = [];
  let removedCardMarkers = 0;
  let removedGroupMarkers = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (cardMarkerService.isCandidate(line)) {
      const marker = cardMarkerService.parse(line, index + 1);
      if (marker && cardNoteIds.has(marker.noteId)) {
        removedCardMarkers += 1;
        continue;
      }
    }

    if (groupMarkerService.isCandidate(line)) {
      const marker = groupMarkerService.parse(line, index + 1);
      if (marker?.noteId !== undefined && groupNoteIds.has(marker.noteId)) {
        removedGroupMarkers += 1;
        continue;
      }
    }

    nextLines.push(line);
  }

  return {
    nextContent: nextLines.join(lineEnding),
    removedCardMarkers,
    removedGroupMarkers,
  };
}

function createEmptyRemovalResult(): MarkdownSyncedMarkerRemovalResult {
  return {
    removedCardMarkers: 0,
    removedGroupMarkers: 0,
    removedMarkers: 0,
    conflictFiles: [],
    failureFiles: [],
  };
}