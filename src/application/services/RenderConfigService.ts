import type { PluginSettings } from "@/application/config/PluginSettings";
import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { hashString } from "@/domain/shared/hash";

export interface RenderPlan {
  deck: string;
  noteModel: string;
  renderConfigHash: string;
}

export class RenderConfigService {
  resolve(card: IndexedCard, settings: PluginSettings): RenderPlan {
    const noteModel = card.cardType === "basic" ? settings.qaNoteType : settings.clozeNoteType;
    const deck = card.deckHint?.trim() || settings.defaultDeck;
    const mapping = settings.noteFieldMappings[createNoteFieldMappingKey(card.cardType, noteModel)] ?? null;

    return {
      deck,
      noteModel,
      renderConfigHash: hashString(
        JSON.stringify({
          cardType: card.cardType,
          noteModel,
          deck,
          mapping,
          addObsidianBacklink: settings.addObsidianBacklink,
          convertHighlightsToCloze: settings.convertHighlightsToCloze,
        }),
      ),
    };
  }
}