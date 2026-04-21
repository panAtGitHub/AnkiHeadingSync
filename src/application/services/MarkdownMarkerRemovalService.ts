import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import { toPluginFileFailure, type PluginFileFailure } from "@/application/errors/PluginUserError";
import { CardMarkerRemovalService, type MarkerRemovalTarget } from "@/domain/manual-sync/services/CardMarkerRemovalService";

export interface MarkdownMarkerRemovalResult {
  removedMarkers: number;
  conflictFiles: string[];
  failureFiles: PluginFileFailure[];
}

export class MarkdownMarkerRemovalService {
  constructor(
    private readonly vaultGateway: ManualSyncVaultGateway,
    private readonly markerRemovalService = new CardMarkerRemovalService(),
  ) {}

  async remove(filePath: string, targets: MarkerRemovalTarget[]): Promise<MarkdownMarkerRemovalResult> {
    if (targets.length === 0) {
      return {
        removedMarkers: 0,
        conflictFiles: [],
        failureFiles: [],
      };
    }

    const sourceFile = await this.vaultGateway.readMarkdownFile(filePath);
    if (!sourceFile) {
      return {
        removedMarkers: 0,
        conflictFiles: [],
        failureFiles: [{ filePath, key: "errors.markerRemoval.markdownFileNotFound" }],
      };
    }

    const removal = this.markerRemovalService.apply(sourceFile.content, targets);

    try {
      if (removal.nextContent !== sourceFile.content) {
        await this.vaultGateway.replaceMarkdownFile(filePath, sourceFile.content, removal.nextContent);
      }

      return {
        removedMarkers: removal.removedMarkers,
        conflictFiles: [],
        failureFiles: [],
      };
    } catch (error) {
      if (error instanceof MarkdownWriteConflictError) {
        return {
          removedMarkers: 0,
          conflictFiles: [filePath],
          failureFiles: [],
        };
      }

      return {
        removedMarkers: 0,
        conflictFiles: [],
        failureFiles: [toPluginFileFailure(filePath, error)],
      };
    }
  }
}