import { describe, expect, it } from "vitest";

import { CardMarkerService } from "./CardMarkerService";

describe("CardMarkerService", () => {
  it("parses cardId and noteId from the module 3 marker format", () => {
    const service = new CardMarkerService(() => 1);

    expect(service.parse("<!-- AHS:card=ahs_123 note=42 -->", 3)).toEqual({
      cardId: "ahs_123",
      noteId: 42,
      raw: "<!-- AHS:card=ahs_123 note=42 -->",
      lineIndex: 3,
    });
  });

  it("writes multiple markers bottom-up in a single file", () => {
    const service = new CardMarkerService(() => 1);
    const sourceContent = ["#### Top", "Body 1", "", "#### Bottom", "Body 2"].join("\n");

    const nextContent = service.applyBatch(sourceContent, [
      {
        filePath: "notes/example.md",
        cardId: "ahs_top",
        noteId: 11,
        blockStartLine: 1,
        contentEndLine: 2,
        blockEndLine: 3,
        sourceContent,
      },
      {
        filePath: "notes/example.md",
        cardId: "ahs_bottom",
        noteId: 22,
        blockStartLine: 4,
        contentEndLine: 5,
        blockEndLine: 5,
        sourceContent,
      },
    ]);

    expect(nextContent).toBe([
      "#### Top",
      "Body 1",
      "<!-- AHS:card=ahs_top note=11 -->",
      "",
      "#### Bottom",
      "Body 2",
      "<!-- AHS:card=ahs_bottom note=22 -->",
    ].join("\n"));
  });
});