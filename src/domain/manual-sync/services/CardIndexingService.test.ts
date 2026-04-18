import { describe, expect, it } from "vitest";

import type { CardState } from "@/domain/manual-sync/entities/PluginState";
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

  it("reuses cardId and noteId when marker is missing but the same file has a unique raw block hash match", () => {
    const service = new CardIndexingService();
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: rawBlockText,
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [createKnownCardState({ rawBlockHash: hashString(rawBlockText) })],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      cardId: "ahs_known",
      noteId: 42,
      markerState: "missing",
    });
  });

  it("treats a missing marker as a new card when the raw block hash changed", () => {
    const service = new CardIndexingService();
    const oldRawBlockText = ["#### Prompt", "Answer"].join("\n");
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Updated Answer"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [createKnownCardState({ rawBlockHash: hashString(oldRawBlockText) })],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]?.cardId).not.toBe("ahs_known");
    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
  });

  it("does not reuse card identity when multiple same-file candidates share the same raw block hash", () => {
    const service = new CardIndexingService();
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const rawBlockHash = hashString(rawBlockText);
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: rawBlockText,
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [
          createKnownCardState({ cardId: "ahs_known", rawBlockHash }),
          createKnownCardState({ cardId: "ahs_other", noteId: 99, rawBlockHash }),
        ],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]?.cardId).not.toBe("ahs_known");
    expect(indexedFile.cards[0]?.cardId).not.toBe("ahs_other");
    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
  });

  it("restores noteId from the marker cardId before considering hash-based recovery", () => {
    const service = new CardIndexingService();
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const rawBlockHash = hashString(rawBlockText);
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
          createKnownCardState({ cardId: "ahs_known", rawBlockHash }),
          createKnownCardState({ cardId: "ahs_hash_match", noteId: 99, rawBlockHash }),
        ],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      cardId: "ahs_known",
      noteId: 42,
    });
  });

  it("prefers a known card with cleared noteId over a stale marker noteId", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "<!-- AHS:card=ahs_known note=42 -->"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [createKnownCardState({ cardId: "ahs_known", noteId: undefined })],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      cardId: "ahs_known",
      noteId: undefined,
      markerNoteId: 42,
      markerState: "card-and-note",
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

  it("extracts YAML deck, prefers it over conflicting body deck, and stores a warning on indexed cards", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "---",
          "TARGET DECK: YAML/Deck",
          "---",
          "",
          "TARGET DECK: Body::Deck",
          "",
          "#### Prompt",
          "Answer",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
        fileDeckEnabled: true,
        fileDeckMarker: "TARGET DECK",
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      deckHint: "YAML::Deck",
      deckHintSource: "frontmatter",
    });
    expect(indexedFile.cards[0]?.deckWarnings.map((warning) => warning.code)).toEqual(["deck_conflict_yaml_body"]);
  });

  it("extracts multiline body TARGET DECK while ignoring fenced code blocks", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "```md",
          "TARGET DECK: Fake::Deck",
          "```",
          "",
          "TARGET DECK",
          "Real/Deck",
          "",
          "#### Prompt",
          "Answer",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
        fileDeckEnabled: true,
        fileDeckMarker: "TARGET DECK",
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      deckHint: "Real::Deck",
      deckHintSource: "body",
    });
  });

  it("skips explicit deck extraction when file-level deck mode is disabled", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "TARGET DECK: Scoped/Deck",
          "",
          "#### Prompt",
          "Answer",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
        fileDeckEnabled: false,
        fileDeckMarker: "TARGET DECK",
      },
    );

    expect(indexedFile.cards[0]?.deckHint).toBeUndefined();
    expect(indexedFile.cards[0]?.deckWarnings).toEqual([]);
  });
});

function createKnownCardState(overrides: Partial<CardState> = {}): CardState {
  const rawBlockText = overrides.rawBlockText ?? ["#### Prompt", "Answer"].join("\n");

  return {
    cardId: overrides.cardId ?? "ahs_known",
    noteId: Object.prototype.hasOwnProperty.call(overrides, "noteId") ? overrides.noteId : 42,
    filePath: overrides.filePath ?? "notes/example.md",
    heading: overrides.heading ?? "Prompt",
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown: overrides.bodyMarkdown ?? "Answer",
    cardType: overrides.cardType ?? "basic",
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? rawBlockText.length,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 2,
    contentEndLine: overrides.contentEndLine ?? 2,
    markerLine: overrides.markerLine,
    rawBlockText,
    rawBlockHash: overrides.rawBlockHash ?? hashString(rawBlockText),
    renderConfigHash: overrides.renderConfigHash ?? "render-hash",
    deck: overrides.deck ?? "Obsidian",
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    tagsHint: overrides.tagsHint ?? [],
    lastSyncedAt: overrides.lastSyncedAt ?? 1,
    orphan: overrides.orphan ?? false,
  };
}