import { describe, expect, it } from "vitest";

import type { CardState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { CardIndexingService } from "./CardIndexingService";

describe("CardIndexingService", () => {
  it("leaves noteId unresolved for a missing marker and excludes it from body text", () => {
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
    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
    expect(indexedFile.cards[0]?.idMarkerState).toBe("missing");
    expect(indexedFile.cards[0]?.bodyMarkdown).toBe("Answer");
  });

  it("recovers noteId when the same file has a unique raw block hash match", () => {
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
      noteId: 42,
      idMarkerState: "missing",
      noteIdSource: "state-recovery",
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

    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
  });

  it("does not reuse noteId when multiple same-file candidates share the same raw block hash", () => {
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
          createKnownCardState({ noteId: 42, rawBlockHash }),
          createKnownCardState({ noteId: 99, rawBlockHash }),
        ],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]?.noteId).toBeUndefined();
  });

  it("prefers a trailing ID marker before considering hash-based recovery", () => {
    const service = new CardIndexingService();
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const rawBlockHash = hashString(rawBlockText);
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "<!--ID: 42-->"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [
          createKnownCardState({ noteId: 99, rawBlockHash }),
        ],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      noteId: 42,
      noteIdSource: "marker",
      idMarkerState: "present-valid",
    });
  });

  it("recovers noteId from state when the trailing ID marker is invalid", () => {
    const service = new CardIndexingService();
    const rawBlockText = ["#### Prompt", "Answer"].join("\n");
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "<!--ID: invalid-->"].join("\n"),
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
      noteId: 42,
      noteIdSource: "state-recovery",
      idMarkerState: "present-invalid",
    });
  });

  it("does not treat a non-trailing ID marker as the marker slot", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "<!--ID: 42-->", "Answer"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      noteId: undefined,
      idMarkerState: "missing",
      bodyMarkdown: "<!--ID: 42-->\nAnswer",
    });
  });

  it("splits a tagged QA heading into semantic QA child cards with distinct titles and backlink anchors", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "#### Concepts #anki-list-qa",
          "- Alpha",
          "  First answer",
          "  <!--ID: 42-->",
          "- Beta",
          "  Second answer",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        semanticQaMarker: "#anki-list-qa",
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards).toHaveLength(2);
    expect(indexedFile.cards[0]).toMatchObject({
      noteId: 42,
      noteIdSource: "marker",
      cardType: "semantic-qa",
      heading: "Concepts<br>Alpha",
      backlinkHeadingText: "Concepts #anki-list-qa",
      bodyMarkdown: "First answer",
      markerLine: 4,
      markerIndent: "  ",
    });
    expect(indexedFile.cards[1]).toMatchObject({
      noteId: undefined,
      cardType: "semantic-qa",
      heading: "Concepts<br>Beta",
      backlinkHeadingText: "Concepts #anki-list-qa",
      bodyMarkdown: "Second answer",
    });
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
    noteId: overrides.noteId ?? 42,
    filePath: overrides.filePath ?? "notes/example.md",
    heading: overrides.heading ?? "Prompt",
    backlinkHeadingText: overrides.backlinkHeadingText ?? (overrides.heading ?? "Prompt"),
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