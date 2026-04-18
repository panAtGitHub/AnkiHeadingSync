import { describe, expect, it } from "vitest";

import { hashString } from "@/domain/shared/hash";

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

  it("reuses cardId and noteId from pending write-back when marker is still missing", () => {
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
            rawBlockHash: hashString(["#### Prompt", "Answer"].join("\n")),
          },
        ],
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