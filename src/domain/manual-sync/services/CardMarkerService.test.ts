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
});
