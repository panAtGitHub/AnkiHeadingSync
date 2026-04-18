import type { FolderDeckMode } from "@/application/config/PluginSettings";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { DeckResolutionResult } from "@/domain/manual-sync/value-objects/DeckResolution";

import { DeckNormalizationService } from "./DeckNormalizationService";
import { FolderDeckMappingService } from "./FolderDeckMappingService";

export class DeckResolutionService {
  constructor(
    private readonly folderDeckMappingService = new FolderDeckMappingService(),
    private readonly deckNormalizationService = new DeckNormalizationService(),
  ) {}

  resolve(card: IndexedCard, defaultDeck: string, folderDeckMode: FolderDeckMode): DeckResolutionResult {
    if (card.deckHint) {
      return {
        resolvedDeck: {
          value: this.deckNormalizationService.normalize(card.deckHint),
          source: card.deckHintSource ?? "body",
        },
        warnings: [...card.deckWarnings],
      };
    }

    const folderMapping = this.folderDeckMappingService.mapFilePathToDeck(card.filePath, folderDeckMode);
    if (folderMapping.deck) {
      return {
        resolvedDeck: {
          value: folderMapping.deck,
          source: "folder",
        },
        warnings: [...card.deckWarnings, ...folderMapping.warnings],
      };
    }

    return {
      resolvedDeck: {
        value: this.deckNormalizationService.normalize(defaultDeck),
        source: "default",
      },
      warnings: [
        ...card.deckWarnings,
        ...folderMapping.warnings,
        {
          filePath: card.filePath,
          code: "deck_fallback_default",
          message: "该文件没有显式 deck，且所在位置无法生成文件夹牌组，已回退到默认 deck。",
        },
      ],
    };
  }
}