import { describe, expect, it } from "vitest";

import { SemanticQaListParser } from "./SemanticQaListParser";

describe("SemanticQaListParser", () => {
  it("splits first-level list items into semantic QA cards and excludes inline labels from the answer", () => {
    const parser = new SemanticQaListParser();

    const cards = parser.parse({
      parentHeadingText: "Concepts #anki-list-qa",
      marker: "#anki-list-qa",
      bodyLines: [
        "- Alpha",
        "  First line",
        "  Second line",
        "  <!--ID: 12-->",
        "- Beta",
        "- Gamma",
        "  Third line",
        "    deeper detail",
      ],
      bodyStartLine: 2,
    });

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      heading: "Concepts<br>Alpha",
      backlinkHeadingText: "Concepts #anki-list-qa",
      bodyMarkdown: "First line\nSecond line",
      blockStartLine: 2,
      bodyStartLine: 3,
      blockEndLine: 5,
      contentEndLine: 4,
      markerLine: 5,
      markerIndent: "  ",
      markerNoteId: 12,
      idMarkerState: "present-valid",
    });
    expect(cards[1]).toMatchObject({
      heading: "Concepts<br>Gamma",
      backlinkHeadingText: "Concepts #anki-list-qa",
      bodyMarkdown: "Third line\n  deeper detail",
      blockStartLine: 7,
      bodyStartLine: 8,
      blockEndLine: 9,
      contentEndLine: 9,
      markerLine: undefined,
      idMarkerState: "missing",
    });
    expect(cards[1]?.rawBlockHash).toBeTruthy();
  });

  it("only treats headings with a trailing configured marker as semantic QA headings", () => {
    const parser = new SemanticQaListParser();

    expect(parser.isSemanticQaHeading("Concepts #anki-list-qa", "#anki-list-qa")).toBe(true);
    expect(parser.isSemanticQaHeading("Concepts #anki-list-qa extra", "#anki-list-qa")).toBe(false);
    expect(parser.isSemanticQaHeading("Concepts", "#anki-list-qa")).toBe(false);
  });

  it("cuts a child answer at the first 2+ blank lines when no valid marker exists", () => {
    const parser = new SemanticQaListParser();

    const cards = parser.parse({
      parentHeadingText: "Concepts #anki-list-qa",
      marker: "#anki-list-qa",
      cardAnswerCutoffMode: "double-blank-lines",
      bodyLines: [
        "- Alpha",
        "  First line",
        "  ",
        "  ",
        "  Remark",
      ],
      bodyStartLine: 2,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      bodyMarkdown: "First line",
      contentEndLine: 3,
      markerLine: undefined,
      idMarkerState: "missing",
    });
  });

  it("keeps the old marker-after-remarks semantic layout compatible", () => {
    const parser = new SemanticQaListParser();

    const cards = parser.parse({
      parentHeadingText: "Concepts #anki-list-qa",
      marker: "#anki-list-qa",
      bodyLines: [
        "- Alpha",
        "  First line",
        "  Remark",
        "  <!--ID: 12-->",
      ],
      bodyStartLine: 2,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      bodyMarkdown: "First line\nRemark",
      contentEndLine: 4,
      markerLine: 5,
      markerNoteId: 12,
      idMarkerState: "present-valid",
    });
  });

  it("treats a marker before trailing remarks as the semantic child cutoff", () => {
    const parser = new SemanticQaListParser();

    const cards = parser.parse({
      parentHeadingText: "Concepts #anki-list-qa",
      marker: "#anki-list-qa",
      bodyLines: [
        "- Alpha",
        "  First line",
        "  <!--ID: 12-->",
        "  ",
        "  ",
        "  Remark",
      ],
      bodyStartLine: 2,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      bodyMarkdown: "First line",
      contentEndLine: 3,
      markerLine: 4,
      markerNoteId: 12,
      idMarkerState: "present-valid",
    });
  });
});