import type { PluginSettings } from "@/application/config/PluginSettings";
import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { isClozeCardType } from "@/domain/card/entities/RenderedFields";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { DeckResolutionService } from "@/domain/manual-sync/services/DeckResolutionService";
import type { DeckResolutionWarning } from "@/domain/manual-sync/value-objects/DeckResolution";
import { hashString } from "@/domain/shared/hash";

export interface RenderPlan {
  deck: string;
  noteModel: string;
  renderConfigHash: string;
  warnings: DeckResolutionWarning[];
}

export class RenderConfigService {
  constructor(private readonly deckResolutionService = new DeckResolutionService()) {}

  resolve(card: IndexedCard, settings: PluginSettings): RenderPlan {
    const noteModel = resolveNoteModel(card.cardType, settings);
    const deckResolution = this.deckResolutionService.resolve(card, settings.defaultDeck, settings.folderDeckMode);
    const deck = deckResolution.resolvedDeck.value;
    const mapping = settings.noteFieldMappings[createNoteFieldMappingKey(card.cardType, noteModel)] ?? null;
    const renderConfigPayload = {
      cardType: card.cardType,
      noteModel,
      mapping,
      addObsidianBacklink: settings.addObsidianBacklink,
      convertHighlightsToCloze: settings.convertHighlightsToCloze,
      keepPureTagLinesInCardBody: settings.keepPureTagLinesInCardBody,
    };
    const renderConfigHash = hashString(JSON.stringify(renderConfigPayload));

    return {
      deck,
      noteModel,
      renderConfigHash,
      warnings: deckResolution.warnings,
    };
  }
}

function resolveNoteModel(cardType: IndexedCard["cardType"], settings: PluginSettings): string {
  if (isClozeCardType(cardType)) {
    return settings.clozeNoteType;
  }

  return cardType === "semantic-qa" ? settings.semanticQaNoteType : settings.qaNoteType;
}