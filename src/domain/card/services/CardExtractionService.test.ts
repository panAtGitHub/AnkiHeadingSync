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

  it("detects a block-end AHS marker and excludes it from body markdown", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "#### Prompt",
        "Answer line 1",
        "",
        "Answer line 2",
        "<!-- AHS:123 -->",
        "",
        "### Next heading",
      ].join("\n"),
    };

    const drafts = new CardExtractionService().extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 });

    expect(drafts[0]).toMatchObject({
      bodyMarkdown: ["Answer line 1", "", "Answer line 2"].join("\n"),
      embeddedNoteId: 123,
    });
    expect(drafts[0].source).toMatchObject({
      contentEndLine: 4,
      markerLine: 5,
      blockEndLine: 6,
    });
  });

  it("writes empty-body marker metadata against the heading line", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "#### Prompt",
        "<!-- AHS:456 -->",
      ].join("\n"),
    };

    const [draft] = new CardExtractionService().extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 });

    expect(draft.bodyMarkdown).toBe("");
    expect(draft.embeddedNoteId).toBe(456);
    expect(draft.source).toMatchObject({
      contentEndLine: 1,
      markerLine: 2,
      blockEndLine: 2,
    });
  });

  it("rejects multiple valid AHS markers in one heading block", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "#### Prompt",
        "Answer",
        "<!-- AHS:123 -->",
        "<!-- AHS:456 -->",
      ].join("\n"),
    };

    expect(() => new CardExtractionService().extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 })).toThrow(
      "Multiple AHS markers found in heading block",
    );
  });

  it("rejects invalid AHS marker syntax", () => {
    const sourceFile: SourceFile = {
      path: "notes/example.md",
      basename: "example",
      content: [
        "#### Prompt",
        "Answer",
        "<!-- AHS:not-a-number -->",
      ].join("\n"),
    };

    expect(() => new CardExtractionService().extract(sourceFile, { qaHeadingLevel: 4, clozeHeadingLevel: 5 })).toThrow(
      "Invalid AHS marker found in heading block",
    );
  });

  it("rejects equal heading levels", () => {
    expect(() => validateHeadingPolicy({ qaHeadingLevel: 4, clozeHeadingLevel: 4 })).toThrow(
      "QA and Cloze heading levels must not be equal.",
    );
  });
});