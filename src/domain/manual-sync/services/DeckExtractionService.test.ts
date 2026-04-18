import { describe, expect, it } from "vitest";

import { DeckExtractionService } from "./DeckExtractionService";

describe("DeckExtractionService", () => {
  it("extracts deck from YAML frontmatter using the shared marker", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "---",
      "TARGET DECK: 数学/第一章",
      "---",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("数学::第一章");
    expect(result.explicitDeckSource).toBe("frontmatter");
    expect(result.warnings).toEqual([]);
  });

  it("extracts deck from body inline declaration", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "TARGET DECK: Coding/Deck",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("Coding::Deck");
    expect(result.explicitDeckSource).toBe("body");
  });

  it("extracts deck from body multiline declaration and ignores fenced code blocks", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "```md",
      "TARGET DECK: Fake::Deck",
      "```",
      "",
      "TARGET DECK",
      "Real/Deck",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("Real::Deck");
    expect(result.explicitDeckSource).toBe("body");
  });

  it("accepts matching YAML and body declarations without warning", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "---",
      "TARGET DECK: Coding/Deck",
      "---",
      "",
      "TARGET DECK: Coding::Deck",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("Coding::Deck");
    expect(result.explicitDeckSource).toBe("frontmatter");
    expect(result.warnings).toEqual([]);
  });

  it("uses YAML deck and emits a warning when YAML and body declarations conflict", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "---",
      "TARGET DECK: YAML/Deck",
      "---",
      "",
      "TARGET DECK: Body::Deck",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("YAML::Deck");
    expect(result.explicitDeckSource).toBe("frontmatter");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["deck_conflict_yaml_body"]);
  });

  it("uses the first body declaration and emits a warning when multiple body declarations exist", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "TARGET DECK: Deck/One",
      "TARGET DECK",
      "Deck Two",
      "",
      "#### Prompt",
      "Answer",
    ]));

    expect(result.explicitDeckHint).toBe("Deck::One");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["deck_multiple_body_declarations"]);
  });

  it("respects a renamed marker for both YAML and body", () => {
    const service = new DeckExtractionService();

    const result = service.extract(createSourceFile([
      "---",
      "MY DECK: YAML/Deck",
      "---",
      "",
      "MY DECK: YAML::Deck",
      "",
      "#### Prompt",
      "Answer",
    ]), "MY DECK");

    expect(result.explicitDeckHint).toBe("YAML::Deck");
    expect(result.explicitDeckSource).toBe("frontmatter");
    expect(result.warnings).toEqual([]);
  });
});

function createSourceFile(lines: string[]) {
  return {
    path: "notes/example.md",
    basename: "example",
    content: lines.join("\n"),
  };
}