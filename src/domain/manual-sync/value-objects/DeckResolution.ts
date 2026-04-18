export type DeckResolutionSource = "frontmatter" | "body" | "folder" | "default";

export type DeckResolutionWarningCode =
  | "deck_conflict_yaml_body"
  | "deck_multiple_body_declarations"
  | "deck_invalid_folder_segment"
  | "deck_fallback_default";

export interface ResolvedDeck {
  value: string;
  source: DeckResolutionSource;
}

export interface DeckResolutionWarning {
  filePath: string;
  code: DeckResolutionWarningCode;
  message: string;
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
  return `${warning.filePath}\u0000${warning.code}\u0000${warning.message}`;
}