import { describe, expect, it } from "vitest";

import { CardMarkerService } from "./CardMarkerService";

describe("CardMarkerService", () => {
  it("parses noteId from the ID marker format", () => {
    const service = new CardMarkerService();

    expect(service.parse("<!--ID: 42-->", 3)).toEqual({
      noteId: 42,
      raw: "<!--ID: 42-->",
      lineIndex: 3,
    });
  });

  it("writes multiple markers bottom-up in a single file", () => {
    const service = new CardMarkerService();
    const sourceContent = ["#### Top", "Body 1", "", "", "#### Bottom", "Body 2"].join("\n");

    const nextContent = service.applyBatch(sourceContent, [
      {
        filePath: "notes/example.md",
        noteId: 11,
        blockStartLine: 1,
        contentEndLine: 2,
        blockEndLine: 4,
        sourceContent,
      },
      {
        filePath: "notes/example.md",
        noteId: 22,
        blockStartLine: 5,
        contentEndLine: 6,
        blockEndLine: 6,
        sourceContent,
      },
    ]);

    expect(nextContent).toBe([
      "#### Top",
      "Body 1",
      "<!--ID: 11-->",
      "",
      "",
      "#### Bottom",
      "Body 2",
      "<!--ID: 22-->",
    ].join("\n"));
  });

  it("writes a new marker after the answer and keeps exactly two blank lines before trailing remarks", () => {
    const service = new CardMarkerService();
    const sourceContent = [
      "#### Prompt",
      "Answer",
      "",
      "",
      "Remarks",
    ].join("\n");

    const nextContent = service.applyBatch(sourceContent, [{
      filePath: "notes/example.md",
      noteId: 42,
      blockStartLine: 1,
      contentEndLine: 2,
      blockEndLine: 5,
      sourceContent,
    }]);

    expect(nextContent).toBe([
      "#### Prompt",
      "Answer",
      "<!--ID: 42-->",
      "",
      "",
      "Remarks",
    ].join("\n"));
  });

  it("preserves the normalized marker-before-remarks layout when replacing an existing marker", () => {
    const service = new CardMarkerService();
    const sourceContent = [
      "#### Prompt",
      "Answer",
      "<!--ID: 11-->",
      "",
      "",
      "Remarks",
    ].join("\n");

    const nextContent = service.applyBatch(sourceContent, [{
      filePath: "notes/example.md",
      noteId: 42,
      blockStartLine: 1,
      contentEndLine: 2,
      blockEndLine: 6,
      markerLine: 3,
      sourceContent,
    }]);

    expect(nextContent).toBe([
      "#### Prompt",
      "Answer",
      "<!--ID: 42-->",
      "",
      "",
      "Remarks",
    ].join("\n"));
  });
});
