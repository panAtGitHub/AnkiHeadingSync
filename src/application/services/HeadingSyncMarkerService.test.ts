import { describe, expect, it } from "vitest";

import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";

import { HeadingSyncMarkerService, type MarkerWriteRequest } from "./HeadingSyncMarkerService";

describe("HeadingSyncMarkerService", () => {
  const service = new HeadingSyncMarkerService();

  it("writes a new marker at the end of the heading block", () => {
    const nextContent = service.apply(
      {
        filePath: "notes/example.md",
        sourceContent: ["#### Prompt", "Answer", "", "", "### Next"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 4,
        contentEndLine: 2,
        headingLevel: 4,
        headingText: "Prompt",
      },
      123,
    );

    expect(nextContent).toBe(["#### Prompt", "Answer", "<!-- AHS:123 -->", "", "", "### Next"].join("\n"));
  });

  it("writes the marker right after the heading when the block body is empty", () => {
    const nextContent = service.apply(
      {
        filePath: "notes/example.md",
        sourceContent: ["#### Prompt", "### Next"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 1,
        contentEndLine: 1,
        headingLevel: 4,
        headingText: "Prompt",
      },
      456,
    );

    expect(nextContent).toBe(["#### Prompt", "<!-- AHS:456 -->", "", "", "### Next"].join("\n"));
  });

  it("replaces an existing marker without moving past the next heading", () => {
    const nextContent = service.apply(
      {
        filePath: "notes/example.md",
        sourceContent: ["#### Prompt", "Answer", "<!-- AHS:123 -->", "", "", "### Next"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 5,
        contentEndLine: 2,
        markerLine: 3,
        headingLevel: 4,
        headingText: "Prompt",
      },
      789,
    );

    expect(nextContent).toBe(["#### Prompt", "Answer", "<!-- AHS:789 -->", "", "", "### Next"].join("\n"));
  });

  it("applies multiple writes in one file from bottom to top", () => {
    const sourceContent = [
      "#### Top",
      "Top answer",
      "",
      "",
      "#### Bottom",
      "Bottom answer",
    ].join("\n");

    const writes: MarkerWriteRequest[] = [
      {
        cardKey: createCardKey("top"),
        filePath: "notes/example.md",
        noteId: 111,
        location: {
          filePath: "notes/example.md",
          sourceContent,
          headingLine: 1,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 4,
          contentEndLine: 2,
          headingLevel: 4,
          headingText: "Top",
        },
        mode: "insert",
        sourceHash: createContentHash("hash-top"),
      },
      {
        cardKey: createCardKey("bottom"),
        filePath: "notes/example.md",
        noteId: 222,
        location: {
          filePath: "notes/example.md",
          sourceContent,
          headingLine: 5,
          blockStartLine: 5,
          bodyStartLine: 6,
          blockEndLine: 6,
          contentEndLine: 6,
          headingLevel: 4,
          headingText: "Bottom",
        },
        mode: "insert",
        sourceHash: createContentHash("hash-bottom"),
      },
    ];

    expect(service.applyBatch(sourceContent, writes)).toBe([
      "#### Top",
      "Top answer",
      "<!-- AHS:111 -->",
      "",
      "",
      "#### Bottom",
      "Bottom answer",
      "<!-- AHS:222 -->",
    ].join("\n"));
  });

  it("can replace an old marker and insert a new one in the same batch", () => {
    const sourceContent = [
      "#### First",
      "Body 1",
      "<!-- AHS:42 -->",
      "",
      "",
      "#### Second",
      "Body 2",
    ].join("\n");

    const nextContent = service.applyBatch(sourceContent, [
      {
        cardKey: createCardKey("first"),
        filePath: "notes/example.md",
        noteId: 9001,
        location: {
          filePath: "notes/example.md",
          sourceContent,
          headingLine: 1,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 5,
          contentEndLine: 2,
          markerLine: 3,
          headingLevel: 4,
          headingText: "First",
        },
        mode: "replace",
        sourceHash: createContentHash("hash-first"),
      },
      {
        cardKey: createCardKey("second"),
        filePath: "notes/example.md",
        noteId: 9002,
        location: {
          filePath: "notes/example.md",
          sourceContent,
          headingLine: 6,
          blockStartLine: 6,
          bodyStartLine: 7,
          blockEndLine: 7,
          contentEndLine: 7,
          headingLevel: 4,
          headingText: "Second",
        },
        mode: "insert",
        sourceHash: createContentHash("hash-second"),
      },
    ]);

    expect(nextContent).toBe([
      "#### First",
      "Body 1",
      "<!-- AHS:9001 -->",
      "",
      "",
      "#### Second",
      "Body 2",
      "<!-- AHS:9002 -->",
    ].join("\n"));
  });
});
