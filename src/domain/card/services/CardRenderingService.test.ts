import { describe, expect, it } from "vitest";

import type { RenderResourceResolver } from "@/domain/card/ports/RenderResourceResolver";

import type { CardDraft } from "../entities/CardDraft";
import { CardRenderingService } from "./CardRenderingService";

const resolver: RenderResourceResolver = {
  resolveWikiLink(rawTarget) {
    if (rawTarget.startsWith("Concept")) {
      return {
        url: "obsidian://open?vault=Vault&file=Concept",
        displayText: rawTarget.includes("|") ? rawTarget.split("|")[1] : "Concept",
      };
    }

    return null;
  },
  resolveEmbed(rawTarget) {
    if (rawTarget.startsWith("diagram.png")) {
      return {
        kind: "image",
        fileName: "diagram.png",
        absolutePath: "/vault/diagram.png",
        altText: "diagram.png",
      };
    }

    if (rawTarget.startsWith("clip.mp3")) {
      return {
        kind: "audio",
        fileName: "clip.mp3",
        absolutePath: "/vault/clip.mp3",
      };
    }

    return null;
  },
  createBacklink(location) {
    return `obsidian://open?vault=Vault&file=${encodeURIComponent(location.filePath)}`;
  },
};

function createDraft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    source: {
      filePath: "notes/example.md",
      headingLine: 3,
      blockStartLine: 3,
      bodyStartLine: 4,
      blockEndLine: 8,
      headingLevel: 4,
      headingText: "Prompt",
    },
    heading: "Prompt",
    headingLevel: 4,
    type: "basic",
    bodyMarkdown: "Answer",
    ...overrides,
  };
}

describe("CardRenderingService", () => {
  it("renders a basic card with default deck, note model, and backlink", () => {
    const service = new CardRenderingService();
    const card = service.render(createDraft(), {
      defaultDeck: "Default",
      qaNoteType: "Basic",
      clozeNoteType: "Cloze",
      addObsidianBacklink: true,
      convertHighlightsToCloze: true,
      resourceResolver: resolver,
    });

    expect(card.deck).toBe("Default");
    expect(card.noteModel).toBe("Basic");
    expect(card.renderedFields.kind).toBe("basic");
    expect(card.fields.front).toContain("Prompt");
    expect(card.fields.back).toContain("Open in Obsidian");
    expect(card.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("renders a cloze card with heading in the auxiliary field", () => {
    const service = new CardRenderingService();
    const card = service.render(
      createDraft({
        type: "cloze",
        headingLevel: 5,
        source: {
          filePath: "notes/example.md",
          headingLine: 5,
          blockStartLine: 5,
          bodyStartLine: 6,
          blockEndLine: 7,
          headingLevel: 5,
          headingText: "Context",
        },
        heading: "Context",
        bodyMarkdown: "Use ==ubiquitous language== in the team.",
      }),
      {
        defaultDeck: "Default",
        qaNoteType: "Basic",
        clozeNoteType: "Cloze",
        addObsidianBacklink: true,
        convertHighlightsToCloze: true,
        resourceResolver: resolver,
      },
    );

    expect(card.noteModel).toBe("Cloze");
    expect(card.renderedFields.kind).toBe("cloze");
    expect(card.fields.text).toContain("{{c1::ubiquitous language}}");
    expect(card.fields.extra).toContain("Context");
    expect(card.fields.extra).toContain("Open in Obsidian");
  });

  it("preserves markdown fidelity for math, code, links, and media where feasible", () => {
    const service = new CardRenderingService();
    const card = service.render(
      createDraft({
        bodyMarkdown: [
          "Inline math $a+b$ and display:",
          "",
          "$$",
          "x^2",
          "$$",
          "",
          "`const value = 1`",
          "",
          "```ts",
          "const value = 1;",
          "```",
          "",
          "[[Concept|Read more]]",
          "",
          "![[diagram.png]]",
          "",
          "![[clip.mp3]]",
        ].join("\n"),
      }),
      {
        defaultDeck: "Default",
        qaNoteType: "Basic",
        clozeNoteType: "Cloze",
        addObsidianBacklink: false,
        convertHighlightsToCloze: true,
        resourceResolver: resolver,
      },
    );

    expect(card.fields.back).toContain("\\(a+b\\)");
    expect(card.fields.back).toContain("\\[x^2\\]");
    expect(card.fields.back).toContain("<code>const value = 1</code>");
    expect(card.fields.back).toContain("language-ts");
    expect(card.fields.back).toContain("obsidian://open?vault=Vault&amp;file=Concept");
    expect(card.fields.back).toContain("<img src=\"diagram.png\" alt=\"diagram.png\">");
    expect(card.fields.back).toContain("[sound:clip.mp3]");
    expect(card.media).toHaveLength(2);
  });
});