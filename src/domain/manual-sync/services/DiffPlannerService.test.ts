import { describe, expect, it } from "vitest";

import { createModule3Settings } from "@/test-support/manualSyncFakes";
import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";
import { RenderConfigService } from "@/application/services/RenderConfigService";

import { DiffPlannerService } from "./DiffPlannerService";

describe("DiffPlannerService", () => {
  it("places cardId-only cards without noteId into toCreate", () => {
    const service = new DiffPlannerService();
    const plan = service.plan(
      [
        {
          cardId: "ahs_1",
          filePath: "notes/example.md",
          cardType: "basic",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          deckWarnings: [],
          tagsHint: [],
          markerState: "card-only",
        },
      ],
      createEmptyPluginState(),
      ["notes/example.md"],
      createModule3Settings(),
    );

    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toChangeDeck).toHaveLength(0);
  });

  it("rewrites a missing marker without create or update when the restored card content is unchanged", () => {
    const service = new DiffPlannerService();
    const settings = createModule3Settings();
    const card = {
      cardId: "ahs_known",
      noteId: 42,
      filePath: "notes/example.md",
      cardType: "basic" as const,
      heading: "Prompt",
      headingLevel: 4,
      bodyMarkdown: "Body",
      blockStartOffset: 0,
      blockEndOffset: 16,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 2,
      contentEndLine: 2,
      rawBlockText: ["#### Prompt", "Body"].join("\n"),
      rawBlockHash: "hash-card",
      deckWarnings: [],
      tagsHint: [],
      markerState: "missing" as const,
    };
    const renderPlan = new RenderConfigService().resolve(card, settings);
    const state = {
      files: {},
      cards: {
        ahs_known: {
          cardId: "ahs_known",
          noteId: 42,
          filePath: "notes/example.md",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          renderConfigHash: renderPlan.renderConfigHash,
          deck: renderPlan.deck,
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([card], state, ["notes/example.md"], settings);

    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toChangeDeck).toHaveLength(0);
    expect(plan.toRewriteMarker.map((plannedCard) => plannedCard.card.cardId)).toEqual(["ahs_known"]);
    expect(plan.unchangedCards).toBe(1);
  });

  it("uses rawBlockHash, renderConfigHash, and pending entries to schedule updates and rewrites", () => {
    const service = new DiffPlannerService();
    const state = {
      files: {},
      cards: {
        ahs_1: {
          cardId: "ahs_1",
          noteId: 42,
          filePath: "notes/example.md",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "old-hash",
          renderConfigHash: "old-render",
          deck: "Old",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [
        {
          filePath: "notes/example.md",
          cardId: "ahs_1",
          noteId: 42,
          expectedFileHash: "hash",
          targetMarker: "<!-- AHS:card=ahs_1 note=42 -->",
          rawBlockHash: "hash-card",
        },
      ],
    };

    const plan = service.plan(
      [
        {
          cardId: "ahs_1",
          noteId: 42,
          markerNoteId: 41,
          filePath: "notes/example.md",
          cardType: "basic",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          deckWarnings: [],
          tagsHint: [],
          markerState: "card-and-note",
        },
      ],
      state,
      ["notes/example.md"],
      createModule3Settings(),
    );

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toChangeDeck).toHaveLength(1);
    expect(plan.toRewriteMarker).toHaveLength(1);
  });

  it("marks missing scoped cards as orphan", () => {
    const service = new DiffPlannerService();
    const state = {
      files: {},
      cards: {
        ahs_missing: {
          cardId: "ahs_missing",
          noteId: 1,
          filePath: "notes/example.md",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          renderConfigHash: "render-hash",
          deck: "Obsidian",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([], state, ["notes/example.md"], createModule3Settings());

    expect(plan.toOrphan.map((card) => card.cardId)).toEqual(["ahs_missing"]);
  });

  it("schedules deck migration when only the resolved deck changed", () => {
    const service = new DiffPlannerService();
    const settings = createModule3Settings({ defaultDeck: "New::Deck" });
    const card = {
      cardId: "ahs_1",
      noteId: 42,
      markerNoteId: 42,
      filePath: "example.md",
      cardType: "basic" as const,
      heading: "Prompt",
      headingLevel: 4,
      bodyMarkdown: "Body",
      blockStartOffset: 0,
      blockEndOffset: 16,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 2,
      contentEndLine: 2,
      rawBlockText: ["#### Prompt", "Body"].join("\n"),
      rawBlockHash: "hash-card",
      deckWarnings: [],
      tagsHint: [],
      markerState: "card-and-note" as const,
    };
    const legacyRenderPlan = new RenderConfigService().resolve(card, createModule3Settings({ defaultDeck: "Old::Deck" }));
    const state = {
      files: {},
      cards: {
        ahs_1: {
          cardId: "ahs_1",
          noteId: 42,
          filePath: "example.md",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "hash-card",
          renderConfigHash: legacyRenderPlan.renderConfigHash,
          deck: "Old::Deck",
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([card], state, ["example.md"], settings);

    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toChangeDeck).toHaveLength(1);
    expect(plan.unchangedCards).toBe(0);
  });

  it("does not trigger deck migration when only fields changed", () => {
    const service = new DiffPlannerService();
    const settings = createModule3Settings();
    const card = {
      cardId: "ahs_1",
      noteId: 42,
      markerNoteId: 42,
      filePath: "example.md",
      cardType: "basic" as const,
      heading: "Prompt",
      headingLevel: 4,
      bodyMarkdown: "Updated Body",
      blockStartOffset: 0,
      blockEndOffset: 23,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 2,
      contentEndLine: 2,
      rawBlockText: ["#### Prompt", "Updated Body"].join("\n"),
      rawBlockHash: "new-hash",
      deckWarnings: [],
      tagsHint: [],
      markerState: "card-and-note" as const,
    };
    const existingRenderPlan = new RenderConfigService().resolve({
      ...card,
      bodyMarkdown: "Body",
      rawBlockText: ["#### Prompt", "Body"].join("\n"),
      rawBlockHash: "old-hash",
    }, settings);
    const state = {
      files: {},
      cards: {
        ahs_1: {
          cardId: "ahs_1",
          noteId: 42,
          filePath: "example.md",
          heading: "Prompt",
          headingLevel: 4,
          bodyMarkdown: "Body",
          cardType: "basic" as const,
          blockStartOffset: 0,
          blockEndOffset: 16,
          blockStartLine: 1,
          bodyStartLine: 2,
          blockEndLine: 2,
          contentEndLine: 2,
          rawBlockText: ["#### Prompt", "Body"].join("\n"),
          rawBlockHash: "old-hash",
          renderConfigHash: existingRenderPlan.renderConfigHash,
          deck: existingRenderPlan.deck,
          deckWarnings: [],
          tagsHint: [],
          lastSyncedAt: 1,
          orphan: false,
        },
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([card], state, ["example.md"], settings);

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toChangeDeck).toHaveLength(0);
  });
});