import type { FolderDeckMode } from "@/application/config/PluginSettings";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";

import { DeckNormalizationService } from "./DeckNormalizationService";

export interface FolderDeckMappingResult {
  deck?: string;
  warnings: DeckResolutionWarning[];
}

export class FolderDeckMappingService {
  constructor(private readonly deckNormalizationService = new DeckNormalizationService()) {}

  mapFilePathToDeck(filePath: string, mode: FolderDeckMode): FolderDeckMappingResult {
    if (mode === "off") {
      return { warnings: [] };
    }

    const lastSlash = filePath.lastIndexOf("/");
    if (lastSlash < 0) {
      return { warnings: [] };
    }

    const folderPath = filePath.slice(0, lastSlash);
    if (!folderPath.trim()) {
      return { warnings: [] };
    }

    const segments = folderPath.split("/").filter(Boolean);
    if (mode === "folder-and-file") {
      const fileName = filePath.slice(lastSlash + 1).replace(/\.[^.]+$/, "").trim();
      if (fileName) {
        segments.push(fileName);
      }
    }

    if (segments.some((segment) => segment.includes("::"))) {
      return {
        warnings: [{
          filePath,
          code: "deck_invalid_folder_segment",
          message: "检测到文件夹名或文件名包含 ::，本次已放弃文件夹映射并回退到默认 deck。",
        }],
      };
    }

    return {
      deck: this.deckNormalizationService.normalize(segments.join("/")),
      warnings: [],
    };
  }
}