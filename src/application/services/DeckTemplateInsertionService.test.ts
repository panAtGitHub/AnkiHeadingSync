import { describe, expect, it } from "vitest";

import { DeckTemplateInsertionService } from "./DeckTemplateInsertionService";

describe("DeckTemplateInsertionService", () => {
  it("creates YAML frontmatter and expands filename in the template", () => {
    const service = new DeckTemplateInsertionService();

    const result = service.insert(
      {
        path: "数学/第一章/第一节.md",
        basename: "第一节",
        content: ["#### Prompt", "Answer"].join("\n"),
      },
      "TARGET DECK",
      "obsidian::filename",
      "yaml",
    );

    expect(result.insertedDeck).toBe("obsidian::第一节");
    expect(result.nextContent).toBe([
      "---",
      "TARGET DECK: obsidian::第一节",
      "---",
      "",
      "#### Prompt",
      "Answer",
    ].join("\n"));
  });

  it("replaces an existing YAML marker instead of duplicating it", () => {
    const service = new DeckTemplateInsertionService();

    const result = service.insert(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "---",
          "TARGET DECK: old::deck",
          "alias: test",
          "---",
          "",
          "#### Prompt",
          "Answer",
        ].join("\n"),
      },
      "TARGET DECK",
      "vault::filename",
      "yaml",
    );

    expect(result.nextContent).toContain("TARGET DECK: vault::example");
    expect(result.nextContent.match(/TARGET DECK:/g)).toHaveLength(1);
  });

  it("writes the body declaration near the top of the body", () => {
    const service = new DeckTemplateInsertionService();

    const result = service.insert(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "---",
          "tags: [test]",
          "---",
          "",
          "#### Prompt",
          "Answer",
        ].join("\n"),
      },
      "MY DECK",
      "vault::filename",
      "body",
    );

    expect(result.nextContent).toBe([
      "---",
      "tags: [test]",
      "---",
      "",
      "MY DECK: vault::example",
      "",
      "#### Prompt",
      "Answer",
    ].join("\n"));
  });
});