import type { PluginSettings } from "@/application/config/PluginSettings";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { DeckResolutionResult } from "@/domain/manual-sync/value-objects/DeckResolution";

import { DeckNormalizationService } from "./DeckNormalizationService";
import { FolderDeckMappingService } from "./FolderDeckMappingService";

export class DeckResolutionService {
  constructor(
    private readonly folderDeckMappingService = new FolderDeckMappingService(),
    private readonly deckNormalizationService = new DeckNormalizationService(),
  ) {}

  resolve(card: IndexedCard, settings: Pick<PluginSettings, "defaultDeck" | "folderDeckMode" | "alternateFolderDeckModeFolders">): DeckResolutionResult {
    if (card.deckHint) {
      return {
        resolvedDeck: {
          value: this.deckNormalizationService.normalize(card.deckHint),
          source: card.deckHintSource ?? "body",
        },
        warnings: [...card.deckWarnings],
      };
    }

    const folderMapping = this.folderDeckMappingService.mapFilePathToDeck(
      card.filePath,
      settings.folderDeckMode,
      settings.alternateFolderDeckModeFolders,
    );
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
        value: this.deckNormalizationService.normalize(settings.defaultDeck),
        source: "default",
      },
      warnings: [
        ...card.deckWarnings,
        ...folderMapping.warnings,
        {
          filePath: card.filePath,
          code: "deck_fallback_default",
        },
      ],
    };
  }
}