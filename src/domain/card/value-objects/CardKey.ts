export type CardKey = string & { readonly __brand: "CardKey" };

export function createCardKey(value: string): CardKey {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Card key cannot be empty.");
  }

  return normalized as CardKey;
}