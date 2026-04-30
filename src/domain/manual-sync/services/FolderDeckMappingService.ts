import type { FolderDeckMode } from "@/application/config/PluginSettings";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";

import { DeckNormalizationService } from "./DeckNormalizationService";

export interface FolderDeckMappingResult {
  deck?: string;
  warnings: DeckResolutionWarning[];
}

export class FolderDeckMappingService {
  constructor(private readonly deckNormalizationService = new DeckNormalizationService()) {}

  mapFilePathToDeck(filePath: string, mode: FolderDeckMode, alternateFolderDeckModeFolders: string[] = []): FolderDeckMappingResult {
    const effectiveMode = resolveEffectiveFolderDeckMode(filePath, mode, alternateFolderDeckModeFolders);

    if (effectiveMode === "off") {
      return { warnings: [] };
    }

    const normalizedFilePath = normalizeFilePath(filePath);
    const lastSlash = normalizedFilePath.lastIndexOf("/");
    if (lastSlash < 0) {
      return { warnings: [] };
    }

    const folderPath = normalizedFilePath.slice(0, lastSlash);
    if (!folderPath.trim()) {
      return { warnings: [] };
    }

    const segments = folderPath.split("/").filter(Boolean);
    if (effectiveMode === "folder-and-file") {
      const fileName = normalizedFilePath.slice(lastSlash + 1).replace(/\.[^.]+$/, "").trim();
      if (fileName) {
        segments.push(fileName);
      }
    }

    if (segments.some((segment) => segment.includes("::"))) {
      return {
        warnings: [{
          filePath,
          code: "deck_invalid_folder_segment",
        }],
      };
    }

    return {
      deck: this.deckNormalizationService.normalize(segments.join("/")),
      warnings: [],
    };
  }
}

function resolveEffectiveFolderDeckMode(filePath: string, mode: FolderDeckMode, alternateFolderDeckModeFolders: string[]): FolderDeckMode {
  if (mode === "off") {
    return "off";
  }

  const normalizedFilePath = normalizeFilePath(filePath);
  const hasAlternateOverride = alternateFolderDeckModeFolders.some((folderPath) => {
    const normalizedFolderPath = normalizeFolderPath(folderPath);
    return normalizedFolderPath.length > 0 && isPathInsideFolder(normalizedFilePath, normalizedFolderPath);
  });

  if (!hasAlternateOverride) {
    return mode;
  }

  return mode === "folder" ? "folder-and-file" : "folder";
}

function normalizeFolderPath(folderPath: string): string {
  return folderPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeFilePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathInsideFolder(filePath: string, folderPath: string): boolean {
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}