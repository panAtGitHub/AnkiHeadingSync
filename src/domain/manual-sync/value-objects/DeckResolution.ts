export type DeckResolutionSource = "frontmatter" | "body" | "folder" | "default";

export type DeckResolutionWarningCode =
  | "deck_conflict_yaml_body"
  | "deck_multiple_body_declarations"
  | "deck_invalid_folder_segment"
  | "deck_fallback_default";

export type DeckResolutionWarningParams = Record<string, string | number | boolean>;

export interface ResolvedDeck {
  value: string;
  source: DeckResolutionSource;
}

export interface DeckResolutionWarning {
  filePath: string;
  code: DeckResolutionWarningCode;
  params?: DeckResolutionWarningParams;
}

export interface ExplicitDeckExtractionResult {
  frontmatterDeck?: string;
  bodyDeck?: string;
  explicitDeckHint?: string;
  explicitDeckSource?: Extract<DeckResolutionSource, "frontmatter" | "body">;
  warnings: DeckResolutionWarning[];
}

export interface DeckResolutionResult {
  resolvedDeck: ResolvedDeck;
  warnings: DeckResolutionWarning[];
}

export function getDeckResolutionWarningKey(warning: DeckResolutionWarning): string {
  return `${warning.filePath}\u0000${warning.code}\u0000${stableStringify(warning.params)}`;
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);

  return `{${entries.join(",")}}`;
}