export type DeckName = string & { readonly __brand: "DeckName" };

export function createDeckName(value: string): DeckName {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Deck name cannot be empty.");
  }

  return normalized as DeckName;
}