import { describe, expect, it } from "vitest";

import { QaGroupBlockParser } from "./QaGroupBlockParser";

const VALID_GI_MARKER = "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->";

describe("QaGroupBlockParser", () => {
  it("cuts a new group block at the first 2+ blank lines when no GI marker exists", () => {
    const parser = new QaGroupBlockParser();

    const block = parser.parse({
      parentHeadingText: "Concepts #anki-list",
      marker: "#anki-list",
      cardAnswerCutoffMode: "double-blank-lines",
      bodyStartLine: 2,
      bodyLines: [
        "- Alpha",
        "  - First answer",
        "",
        "",
        "Remarks",
      ],
    });

    expect(block).toMatchObject({
      markerState: "missing",
      contentEndLine: 3,
      markerLine: undefined,
      items: [
        { title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
      ],
    });
    expect(block.rawBlockText).not.toContain("Remarks");
  });

  it("treats a GI marker before trailing remarks as the group cutoff", () => {
    const parser = new QaGroupBlockParser();

    const block = parser.parse({
      parentHeadingText: "Concepts #anki-list",
      marker: "#anki-list",
      bodyStartLine: 2,
      bodyLines: [
        "- Alpha",
        "  - First answer",
        VALID_GI_MARKER,
        "",
        "",
        "Remarks",
      ],
    });

    expect(block).toMatchObject({
      markerState: "present-valid",
      contentEndLine: 3,
      markerLine: 4,
      groupMarker: {
        noteId: 42,
      },
      items: [
        { title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
      ],
    });
    expect(block.rawBlockText).not.toContain("Remarks");
  });

  it("keeps the old GI-after-remarks layout compatible and lets a valid GI beat blank-line cutoff", () => {
    const parser = new QaGroupBlockParser();
    const input = {
      parentHeadingText: "Concepts #anki-list",
      marker: "#anki-list",
      bodyStartLine: 2,
      cardAnswerCutoffMode: "double-blank-lines" as const,
      bodyLines: [
        "- Alpha",
        "  - First answer",
        "",
        "",
        "Remarks",
        VALID_GI_MARKER,
      ],
    };

    const firstParse = parser.parse(input);
    const secondParse = parser.parse(input);

    expect(firstParse).toMatchObject({
      markerState: "present-valid",
      contentEndLine: 6,
      markerLine: 7,
      groupMarker: {
        noteId: 42,
      },
    });
    expect(firstParse.rawBlockText).toContain("Remarks");
    expect(secondParse.rawBlockHash).toBe(firstParse.rawBlockHash);
  });
});