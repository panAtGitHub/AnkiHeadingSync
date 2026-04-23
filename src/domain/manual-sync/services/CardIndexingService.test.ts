import { describe, expect, it } from "vitest";

import { buildGroupSrc } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { CardState, GroupBlockState } from "@/domain/manual-sync/entities/PluginState";
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

  it("treats a valid ID marker before trailing remarks as the body cutoff", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "<!--ID: 42-->", "", "", "Remarks"].join("\n"),
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
      noteId: 42,
      noteIdSource: "marker",
      idMarkerState: "present-valid",
      bodyMarkdown: "Answer",
      contentEndLine: 2,
      markerLine: 3,
    });
  });

  it("cuts normal card content at the first 2+ blank lines when no valid marker exists", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "", "", "Remarks"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        cardAnswerCutoffMode: "double-blank-lines",
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      noteId: undefined,
      idMarkerState: "missing",
      bodyMarkdown: "Answer",
      contentEndLine: 2,
      markerLine: undefined,
    });
  });

  it("keeps the old marker-after-remarks layout compatible and lets a valid marker beat blank-line cutoff", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["#### Prompt", "Answer", "", "", "Remarks", "<!--ID: 42-->"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        cardAnswerCutoffMode: "double-blank-lines",
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      noteId: 42,
      noteIdSource: "marker",
      idMarkerState: "present-valid",
      bodyMarkdown: "Answer\n\n\nRemarks",
      contentEndLine: 5,
      markerLine: 6,
    });
  });

  it("applies the same double-blank-line cutoff to cloze cards", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: ["##### Cloze", "{{c1::Answer}}", "", "", "Remarks"].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        cardAnswerCutoffMode: "double-blank-lines",
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards[0]).toMatchObject({
      cardType: "cloze",
      bodyMarkdown: "{{c1::Answer}}",
      contentEndLine: 2,
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

  it("indexes a #anki-list heading as one QA Group block and parses its GI marker", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "#### Concepts #anki-list",
          "- Alpha",
          "  - First answer",
          "- Beta",
          "  - Second answer",
          "<!--GI:n=42;i=item_a:1,item_b:2;f=3,4,5,6,7,8,9,10,11,12-->",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        qaGroupMarker: "#anki-list",
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards).toHaveLength(0);
    expect(indexedFile.groupBlocks).toHaveLength(1);
    expect(indexedFile.groupBlocks?.[0]).toMatchObject({
      noteId: 42,
      markerState: "present-valid",
      stem: "Concepts",
      items: [
        { title: "Alpha", answer: "First answer", ordinalInMarkdown: 1 },
        { title: "Beta", answer: "Second answer", ordinalInMarkdown: 2 },
      ],
      freeSlots: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
  });

  it("recovers QA Group note identity from prior group state when GI is missing", () => {
    const service = new CardIndexingService();
    const headingText = "Concepts #anki-list";
    const rawBlockText = [
      "qa-group:Concepts",
      "Alpha\nFirst answer",
      "Beta\nSecond answer",
      "- Alpha",
      "  - First answer",
      "- Beta",
      "  - Second answer",
    ].join("\n");
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          `#### ${headingText}`,
          "- Alpha",
          "  - First answer",
          "- Beta",
          "  - Second answer",
        ].join("\n"),
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        qaGroupMarker: "#anki-list",
        fileStamp: "1:1",
        knownCards: [],
        knownGroupBlocks: [createKnownGroupState({
          groupId: "group-1",
          noteId: 42,
          headingText,
          backlinkHeadingText: headingText,
          stem: "Concepts",
          src: buildGroupSrc("notes/example.md", headingText),
          rawBlockText,
          rawBlockHash: hashString(rawBlockText),
        })],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.groupBlocks).toHaveLength(1);
    expect(indexedFile.groupBlocks?.[0]).toMatchObject({
      noteId: 42,
      groupId: "group-1",
      identitySource: "state-recovery",
      markerState: "missing",
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

  it("writes file-level tags into basic, cloze, and semantic QA cards", () => {
    const service = new CardIndexingService();
    const indexedFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "#### Basic",
          "Answer",
          "",
          "##### Cloze",
          "{{c1::Body}}",
          "",
          "#### Concepts #anki-list-qa",
          "- Alpha",
          "  First answer",
        ].join("\n"),
        tags: ["📖::一人公司", "3地区"],
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        semanticQaMarker: "#anki-list-qa",
        syncObsidianTagsToAnki: true,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(indexedFile.cards.map((card) => card.tagsHint)).toEqual([
      ["📖::一人公司", "3地区"],
      ["📖::一人公司", "3地区"],
      ["📖::一人公司", "3地区"],
    ]);
  });

  it("writes empty tags when Obsidian tag sync is disabled and applies file-level tags to QA Group when enabled", () => {
    const service = new CardIndexingService();
    const disabledFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "#### Concepts #anki-list",
          "- Alpha",
          "  - First answer",
        ].join("\n"),
        tags: ["📖::一人公司", "3地区"],
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        qaGroupMarker: "#anki-list",
        syncObsidianTagsToAnki: false,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(disabledFile.groupBlocks?.[0]?.tagsHint).toEqual([]);

    const enabledFile = service.index(
      {
        path: "notes/example.md",
        basename: "example",
        content: [
          "#### Concepts #anki-list",
          "- Alpha",
          "  - First answer",
        ].join("\n"),
        tags: ["📖::一人公司", "3地区"],
      },
      {
        qaHeadingLevel: 4,
        clozeHeadingLevel: 5,
        qaGroupMarker: "#anki-list",
        syncObsidianTagsToAnki: true,
        fileStamp: "1:1",
        knownCards: [],
        pendingWriteBack: [],
      },
    );

    expect(enabledFile.groupBlocks?.[0]?.tagsHint).toEqual(["📖::一人公司", "3地区"]);
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

function createKnownGroupState(overrides: Partial<GroupBlockState> = {}): GroupBlockState {
  return {
    groupId: overrides.groupId ?? "group-1",
    noteId: overrides.noteId ?? 42,
    filePath: overrides.filePath ?? "notes/example.md",
    headingText: overrides.headingText ?? "Concepts #anki-list",
    backlinkHeadingText: overrides.backlinkHeadingText ?? "Concepts #anki-list",
    headingLevel: overrides.headingLevel ?? 4,
    stem: overrides.stem ?? "Concepts",
    src: overrides.src ?? buildGroupSrc("notes/example.md", "Concepts #anki-list"),
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 0,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 5,
    contentEndLine: overrides.contentEndLine ?? 5,
    markerLine: overrides.markerLine,
    markerIndent: overrides.markerIndent,
    rawBlockText: overrides.rawBlockText ?? "qa-group:Concepts",
    rawBlockHash: overrides.rawBlockHash ?? hashString(overrides.rawBlockText ?? "qa-group:Concepts"),
    deck: overrides.deck ?? "notes",
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    items: overrides.items ?? [],
    freeSlots: overrides.freeSlots ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    lastSyncedAt: overrides.lastSyncedAt ?? 1,
    orphan: overrides.orphan ?? false,
  };
}