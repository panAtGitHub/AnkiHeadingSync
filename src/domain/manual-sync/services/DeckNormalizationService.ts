export class DeckNormalizationService {
  normalize(deckName: string): string {
    const normalizedSeparators = deckName.trim().replace(/\\/g, "/").replace(/\/+?/g, "::");
    const segments = normalizedSeparators
      .split(/::+/)
      .map((segment) => segment.trim().replace(/^:+|:+$/g, ""))
      .filter(Boolean);

    if (segments.length === 0) {
      throw new Error("Deck 不能为空，请检查 TARGET DECK 或默认 deck 配置。");
    }

    return segments.join("::");
  }
}