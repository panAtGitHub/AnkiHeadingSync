import type { PluginSettings } from "@/application/config/PluginSettings";
import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { DeckResolutionService } from "@/domain/manual-sync/services/DeckResolutionService";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { hashString } from "@/domain/shared/hash";

export interface RenderPlan {
  deck: string;
  noteModel: string;
  renderConfigHash: string;
  compatibleRenderConfigHashes: string[];
  warnings: DeckResolutionWarning[];
}

export class RenderConfigService {
  constructor(private readonly deckResolutionService = new DeckResolutionService()) {}

  resolve(card: IndexedCard, settings: PluginSettings, compatibilityDecks: string[] = []): RenderPlan {
    const noteModel = card.cardType === "basic" ? settings.qaNoteType : settings.clozeNoteType;
    const deckResolution = this.deckResolutionService.resolve(card, settings.defaultDeck, settings.folderDeckMode);
    const deck = deckResolution.resolvedDeck.value;
    const mapping = settings.noteFieldMappings[createNoteFieldMappingKey(card.cardType, noteModel)] ?? null;
    const renderConfigPayload = {
      cardType: card.cardType,
      noteModel,
      mapping,
      addObsidianBacklink: settings.addObsidianBacklink,
      convertHighlightsToCloze: settings.convertHighlightsToCloze,
    };
    const renderConfigHash = hashString(JSON.stringify(renderConfigPayload));
    const compatibleRenderConfigHashes = Array.from(new Set([
      renderConfigHash,
      ...compatibilityDecks.map((compatibilityDeck) => hashString(JSON.stringify({
        ...renderConfigPayload,
        deck: compatibilityDeck,
      }))),
    ]));

    return {
      deck,
      noteModel,
      renderConfigHash,
      compatibleRenderConfigHashes,
      warnings: deckResolution.warnings,
    };
  }
}