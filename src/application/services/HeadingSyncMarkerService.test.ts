import { describe, expect, it } from "vitest";

import { HeadingSyncMarkerService } from "./HeadingSyncMarkerService";

describe("HeadingSyncMarkerService", () => {
  const service = new HeadingSyncMarkerService();

  it("writes a new marker at the end of the heading block", () => {
    const nextContent = service.apply(
      {
        filePath: "notes/example.md",
        sourceContent: ["#### Prompt", "Answer", "", "### Next"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 4,
        headingText: "Prompt",
      },
      123,
    );

    expect(nextContent).toBe(["#### Prompt", "Answer", "<!-- AHS:123 -->", "", "### Next"].join("\n"));
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

    expect(nextContent).toBe(["#### Prompt", "<!-- AHS:456 -->", "### Next"].join("\n"));
  });

  it("replaces an existing marker without moving past the next heading", () => {
    const nextContent = service.apply(
      {
        filePath: "notes/example.md",
        sourceContent: ["#### Prompt", "Answer", "<!-- AHS:123 -->", "### Next"].join("\n"),
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        markerLine: 3,
        headingLevel: 4,
        headingText: "Prompt",
      },
      789,
    );

    expect(nextContent).toBe(["#### Prompt", "Answer", "<!-- AHS:789 -->", "### Next"].join("\n"));
  });
});