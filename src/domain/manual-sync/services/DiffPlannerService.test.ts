import { describe, expect, it } from "vitest";

import { createModule3Settings } from "@/test-support/manualSyncFakes";
import { createEmptyPluginState } from "@/domain/manual-sync/entities/PluginState";

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
          tagsHint: [],
          markerState: "card-only",
        },
      ],
      createEmptyPluginState(),
      ["notes/example.md"],
      createModule3Settings(),
    );

    expect(plan.toCreate).toHaveLength(1);
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
          tagsHint: [],
          markerState: "card-and-note",
        },
      ],
      state,
      ["notes/example.md"],
      createModule3Settings(),
    );

    expect(plan.toUpdate).toHaveLength(1);
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
});