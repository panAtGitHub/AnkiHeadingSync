import { describe, expect, it } from "vitest";

import { createModule3Settings } from "@/test-support/manualSyncFakes";
import { createEmptyPluginState, type CardState } from "@/domain/manual-sync/entities/PluginState";
import { RenderConfigService } from "@/application/services/RenderConfigService";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";

import { DiffPlannerService } from "./DiffPlannerService";

describe("DiffPlannerService", () => {
  it("places unresolved cards without noteId into toCreate", () => {
    const service = new DiffPlannerService();
    const plan = service.plan(
      [
        createIndexedCard({ noteId: undefined, idMarkerState: "missing" }),
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
    const card = createIndexedCard({
      noteId: 42,
      idMarkerState: "missing",
      noteIdSource: "state-recovery",
    });
    const renderPlan = new RenderConfigService().resolve(card, settings);
    const state = {
      files: {},
      cards: {
        "42": createCardState({ noteId: 42, renderConfigHash: renderPlan.renderConfigHash, deck: renderPlan.deck }),
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([card], state, ["notes/example.md"], settings);

    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toChangeDeck).toHaveLength(0);
    expect(plan.toRewriteMarker.map((plannedCard) => plannedCard.noteId)).toEqual([42]);
    expect(plan.unchangedCards).toBe(1);
  });

  it("uses rawBlockHash, renderConfigHash, and pending entries to schedule updates and rewrites", () => {
    const service = new DiffPlannerService();
    const state = {
      files: {},
      cards: {
        "42": createCardState({ noteId: 42, rawBlockHash: "old-hash", renderConfigHash: "old-render", deck: "Old" }),
      },
      pendingWriteBack: [
        {
          filePath: "notes/example.md",
          blockStartLine: 1,
          expectedFileHash: "hash",
          targetMarker: "<!--ID: 42-->",
          rawBlockHash: "hash-card",
          targetNoteId: 42,
        },
      ],
    };

    const plan = service.plan(
      [
        createIndexedCard({
          noteId: 42,
          rawBlockHash: "hash-card",
          idMarkerState: "present-valid",
          noteIdSource: "marker",
        }),
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
        "1": createCardState({ noteId: 1 }),
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([], state, ["notes/example.md"], createModule3Settings());

    expect(plan.toOrphan.map((card) => card.noteId)).toEqual([1]);
  });

  it("schedules deck migration when only the resolved deck changed", () => {
    const service = new DiffPlannerService();
    const settings = createModule3Settings({ defaultDeck: "New::Deck" });
    const card = createIndexedCard({
      noteId: 42,
      filePath: "example.md",
      idMarkerState: "present-valid",
      noteIdSource: "marker",
    });
    const legacyRenderPlan = new RenderConfigService().resolve(card, createModule3Settings({ defaultDeck: "Old::Deck" }));
    const state = {
      files: {},
      cards: {
        "42": createCardState({ noteId: 42, filePath: "example.md", renderConfigHash: legacyRenderPlan.renderConfigHash, deck: "Old::Deck" }),
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
    const card = createIndexedCard({
      noteId: 42,
      bodyMarkdown: "Updated Body",
      rawBlockText: ["#### Prompt", "Updated Body"].join("\n"),
      rawBlockHash: "new-hash",
      blockEndOffset: 23,
      filePath: "example.md",
      idMarkerState: "present-valid",
      noteIdSource: "marker",
    });
    const existingRenderPlan = new RenderConfigService().resolve({
      ...card,
      bodyMarkdown: "Body",
      rawBlockText: ["#### Prompt", "Body"].join("\n"),
      rawBlockHash: "old-hash",
    }, settings);
    const state = {
      files: {},
      cards: {
        "42": createCardState({ noteId: 42, filePath: "example.md", rawBlockHash: "old-hash", renderConfigHash: existingRenderPlan.renderConfigHash, deck: existingRenderPlan.deck }),
      },
      pendingWriteBack: [],
    };

    const plan = service.plan([card], state, ["example.md"], settings);

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toChangeDeck).toHaveLength(0);
  });
});

function createIndexedCard(overrides: Partial<IndexedCard> = {}): IndexedCard {
  const rawBlockText = overrides.rawBlockText ?? ["#### Prompt", overrides.bodyMarkdown ?? "Body"].join("\n");

  return {
    noteId: overrides.noteId,
    syncKey: overrides.syncKey ?? `example.md\u00001\u0000${overrides.rawBlockHash ?? "hash-card"}`,
    idMarkerState: overrides.idMarkerState ?? "present-valid",
    noteIdSource: overrides.noteIdSource,
    filePath: overrides.filePath ?? "notes/example.md",
    cardType: overrides.cardType ?? "basic",
    heading: overrides.heading ?? "Prompt",
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown: overrides.bodyMarkdown ?? "Body",
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 16,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 2,
    contentEndLine: overrides.contentEndLine ?? 2,
    markerLine: overrides.markerLine,
    rawBlockText,
    rawBlockHash: overrides.rawBlockHash ?? "hash-card",
    deckHint: overrides.deckHint,
    deckHintSource: overrides.deckHintSource,
    deckWarnings: overrides.deckWarnings ?? [],
    tagsHint: overrides.tagsHint ?? [],
  };
}

function createCardState(overrides: Partial<CardState> & Pick<CardState, "noteId">): CardState {
  const rawBlockText = overrides.rawBlockText ?? ["#### Prompt", overrides.bodyMarkdown ?? "Body"].join("\n");

  return {
    noteId: overrides.noteId,
    filePath: overrides.filePath ?? "notes/example.md",
    heading: overrides.heading ?? "Prompt",
    headingLevel: overrides.headingLevel ?? 4,
    bodyMarkdown: overrides.bodyMarkdown ?? "Body",
    cardType: overrides.cardType ?? "basic",
    blockStartOffset: overrides.blockStartOffset ?? 0,
    blockEndOffset: overrides.blockEndOffset ?? 16,
    blockStartLine: overrides.blockStartLine ?? 1,
    bodyStartLine: overrides.bodyStartLine ?? 2,
    blockEndLine: overrides.blockEndLine ?? 2,
    contentEndLine: overrides.contentEndLine ?? 2,
    markerLine: overrides.markerLine,
    rawBlockText,
    rawBlockHash: overrides.rawBlockHash ?? "hash-card",
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