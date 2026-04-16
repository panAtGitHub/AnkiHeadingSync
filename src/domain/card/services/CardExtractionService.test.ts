import { describe, expect, it } from "vitest";

import { CardExtractionService, validateHeadingPolicy } from "./CardExtractionService";
import type { SourceFile } from "../entities/SourceFile";

describe("CardExtractionService", () => {
  it("extracts heading blocks using configured QA and Cloze levels", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "TARGET DECK: Coding::Deck",
        "",
        "#### What is DDD?",
        "Domain-driven design keeps the model central.",
        "",
        "##### Fill the gap",
        "Use ==ubiquitous language== across the team.",
        "",
        "#### Another card",
        "Another answer.",
      ].join("\n"),
    };

    const service = new CardExtractionService();
    const drafts = service.extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 });

    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      heading: "What is DDD?",
      type: "basic",
      bodyMarkdown: [
        "Domain-driven design keeps the model central.",
        "",
        "##### Fill the gap",
        "Use ==ubiquitous language== across the team.",
      ].join("\n"),
    });
    expect(drafts[1]).toMatchObject({
      heading: "Fill the gap",
      type: "cloze",
      bodyMarkdown: "Use ==ubiquitous language== across the team.",
    });
    expect(drafts[2].deckHint).toBe("Coding::Deck");
  });

  it("ignores headings and target deck lines inside fenced code blocks", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "```md",
        "#### Not a card",
        "TARGET DECK: Fake",
        "```",
        "",
        "#### Real card",
        "Answer",
      ].join("\n"),
    };

    const service = new CardExtractionService();
    const drafts = service.extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].heading).toBe("Real card");
    expect(drafts[0].deckHint).toBeUndefined();
  });

  it("rejects equal heading levels", () => {
    expect(() => validateHeadingPolicy({ qaHeadingLevel: 4, clozeHeadingLevel: 4 })).toThrow(
      "QA and Cloze heading levels must not be equal.",
    );
  });
});