import { describe, expect, it } from "vitest";

import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";

import { DeckResolutionService } from "./DeckResolutionService";

describe("DeckResolutionService", () => {
  it("prefers explicit deck over folder and default decks", () => {
    const service = new DeckResolutionService();

    const result = service.resolve(createIndexedCard({
      filePath: "课程/数学/第一章/导数.md",
      deckHint: "显式/Deck",
      deckHintSource: "frontmatter",
    }), "Default", "folder");

    expect(result.resolvedDeck).toEqual({
      value: "显式::Deck",
      source: "frontmatter",
    });
    expect(result.warnings).toEqual([]);
  });

  it("uses folder mapping when no explicit deck exists", () => {
    const service = new DeckResolutionService();

    const result = service.resolve(createIndexedCard({ filePath: "课程/数学/第一章/导数.md" }), "Default", "folder");

    expect(result.resolvedDeck).toEqual({
      value: "课程::数学::第一章",
      source: "folder",
    });
  });

  it("supports folder-and-file mapping mode", () => {
    const service = new DeckResolutionService();

    const result = service.resolve(createIndexedCard({ filePath: "课程/数学/第一章/导数.md" }), "Default", "folder-and-file");

    expect(result.resolvedDeck).toEqual({
      value: "课程::数学::第一章::导数",
      source: "folder",
    });
  });

  it("falls back to default deck for root-level files and emits a warning", () => {
    const service = new DeckResolutionService();

    const result = service.resolve(createIndexedCard({ filePath: "导数.md" }), " Default/Deck ", "folder-and-file");

    expect(result.resolvedDeck).toEqual({
      value: "Default::Deck",
      source: "default",
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(["deck_fallback_default"]);
  });

  it("warns and falls back to default deck when folder mapping is invalid", () => {
    const service = new DeckResolutionService();

    const result = service.resolve(createIndexedCard({ filePath: "课程::非法/导数.md" }), "Default", "folder");

    expect(result.resolvedDeck.value).toBe("Default");
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "deck_invalid_folder_segment",
      "deck_fallback_default",
    ]);

    expect(service.resolve(createIndexedCard({
      filePath: "课程::非法/导数.md",
      deckHint: "显式::Deck",
      deckHintSource: "body",
    }), "Default", "folder").resolvedDeck.value).toBe("显式::Deck");
  });
});

function createIndexedCard(overrides: Partial<IndexedCard> = {}): IndexedCard {
  return {
    cardId: overrides.cardId ?? "ahs_1",
    noteId: overrides.noteId,
    markerNoteId: overrides.markerNoteId,
    filePath: overrides.filePath ?? "notes/example.md",
    cardType: overrides.cardType ?? "basic",
    heading: overrides.heading ?? "Prompt",
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown: overrides.bodyMarkdown ?? "Answer",
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 10,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 2,
    contentEndLine: overrides.contentEndLine ?? 2,
    markerLine: overrides.markerLine,
    rawBlockText: overrides.rawBlockText ?? "#### Prompt\nAnswer",
    rawBlockHash: overrides.rawBlockHash ?? "hash-1",
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    tagsHint: overrides.tagsHint ?? [],
    markerState: overrides.markerState ?? "missing",
    sourceContent: overrides.sourceContent,
  };
}