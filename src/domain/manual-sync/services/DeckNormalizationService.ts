import { PluginUserError } from "@/application/errors/PluginUserError";

export class DeckNormalizationService {
  normalize(deckName: string): string {
    const normalizedSeparators = deckName.trim().replace(/\\/g, "/").replace(/\/+?/g, "::");
    const segments = normalizedSeparators
      .split(/::+/)
      .map((segment) => segment.trim().replace(/^:+|:+$/g, ""))
      .filter(Boolean);

    if (segments.length === 0) {
      throw new PluginUserError("errors.deck.emptyName");
    }

    return segments.join("::");
  }
}