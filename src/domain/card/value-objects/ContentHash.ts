export type ContentHash = string & { readonly __brand: "ContentHash" };

export function createContentHash(value: string): ContentHash {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Content hash cannot be empty.");
  }

  return normalized as ContentHash;
}