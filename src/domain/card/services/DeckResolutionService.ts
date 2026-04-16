import { createDeckName, type DeckName } from "../value-objects/DeckName";

export class DeckResolutionService {
  resolve(deckHint: string | undefined, defaultDeck: string): DeckName {
    const preferredDeck = deckHint?.trim() || defaultDeck.trim();

    if (!preferredDeck) {
      throw new Error("A card deck could not be resolved.");
    }

    return createDeckName(preferredDeck);
  }
}