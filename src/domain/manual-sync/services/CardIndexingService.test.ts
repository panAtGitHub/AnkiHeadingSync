import { describe, expect, it } from "vitest";

import { CardIndexingService } from "./CardIndexingService";

describe("CardIndexingService", () => {
  it("generates cardId for a missing marker and excludes the marker from body text", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards).toHaveLength(1);
    expect(indexedFile.cards[0]?.cardId.startsWith("ahs_")).toBe(true);
    expect(indexedFile.cards[0]?.markerState).toBe("missing");
    expect(indexedFile.cards[0]?.bodyMarkdown).toBe("Answer");
  });

  it("treats a missing marker as a new card even if local pending state has the same raw block hash", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [
          {
            filePath: "notes/example.md",
            cardId: "ahs_known",
            noteId: 42,
            expectedFileHash: "hash",
            targetMarker: "<!-- AHS:card=ahs_known note=42 -->",
            rawBlockHash: "hash-card",
          },
        ],
      },
    );

    expect(indexedFile.cards[0]?.cardId).not.toBe("ahs_known");
    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
  });

  it("restores noteId when the marker still carries cardId", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "<!-- AHS:card=ahs_known -->"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [
          {
            cardId: "ahs_known",
            noteId: 42,
            filePath: "notes/example.md",
            heading: "Prompt",
            headingLevel: 4,
            bodyMarkdown: "Answer",
            cardType: "basic",
            blockStartOffset: 0,
            blockEndOffset: 13,
            blockStartLine: 1,
            bodyStartLine: 2,
            blockEndLine: 3,
            contentEndLine: 2,
            rawBlockText: ["#### Prompt", "Answer"].join("\n"),
            rawBlockHash: "hash-card",
            renderConfigHash: "render-hash",
            deck: "Obsidian",
            tagsHint: [],
            lastSyncedAt: 1,
            orphan: false,
          },
        ],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      cardId: "ahs_known",
      noteId: 42,
    });
  });

  it("rejects misplaced or multiple markers inside a single heading block", () => {
    const service = new CardIndexingService();

    expect(() =>
      service.index(
        {
          path: "notes/example.md",
          basename: "example",
          content: ["#### Prompt", "<!-- AHS:card=ahs_1 -->", "Answer", "<!-- AHS:card=ahs_2 -->"].join("\n"),
        },
        {
          qaHeadingLevel: 4,
          clozeHeadingLevel: 5,
          fileStamp: "1:1",
          knownCards: [],
          pendingWriteBack: [],
        },
      ),
    ).toThrow("Multiple AHS markers");
  });
});