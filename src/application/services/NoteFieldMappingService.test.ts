import { describe, expect, it } from "vitest";

import type { Card } from "@/domain/card/entities/Card";
import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";
import { createDeckName } from "@/domain/card/value-objects/DeckName";
import { createNoteModelName } from "@/domain/card/value-objects/NoteModelName";

import { NoteFieldMappingService } from "./NoteFieldMappingService";

function createCard(overrides: Partial<Card>): Card {
  return {
    key: createCardKey("card-key"),
    source: {
      filePath: "notes/example.md",
      headingLine: 1,
      blockStartLine: 1,
      bodyStartLine: 2,
      blockEndLine: 3,
      headingLevel: 4,
      headingText: "Prompt",
    },
    type: "basic",
    heading: "Prompt",
    bodyMarkdown: "Answer",
    deck: createDeckName("Deck"),
    noteModel: createNoteModelName("Basic"),
    tags: [],
    renderedFields: {
      kind: "basic",
      values: {
        front: "Prompt",
        back: "Answer",
      },
    },
    fields: {
      front: "Prompt",
      back: "Answer",
    },
    contentHash: createContentHash("hash"),
    media: [],
    ...overrides,
  };
}

describe("NoteFieldMappingService", () => {
  it("maps basic semantic fields onto a basic model", () => {
    const service = new NoteFieldMappingService();
    const fields = service.map(createCard({}), {
      fieldNames: ["Front", "Back"],
      isCloze: false,
    });

    expect(fields).toEqual({ Front: "Prompt", Back: "Answer" });
  });

  it("maps cloze semantic fields onto text and extra fields", () => {
    const service = new NoteFieldMappingService();
    const fields = service.map(
      createCard({
        type: "cloze",
        noteModel: createNoteModelName("Cloze"),
        renderedFields: {
          kind: "cloze",
          values: {
            text: "{{c1::answer}}",
            extra: "Context",
          },
        },
        fields: {
          text: "{{c1::answer}}",
          extra: "Context",
        },
      }),
      {
        fieldNames: ["Text", "Extra"],
        isCloze: true,
      },
    );

    expect(fields).toEqual({ Text: "{{c1::answer}}", Extra: "Context" });
  });

  it("rejects a non-cloze model for a cloze card", () => {
    const service = new NoteFieldMappingService();

    expect(() =>
      service.map(
        createCard({
          type: "cloze",
          noteModel: createNoteModelName("WrongModel"),
          renderedFields: {
            kind: "cloze",
            values: {
              text: "{{c1::answer}}",
              extra: "Context",
            },
          },
          fields: {
            text: "{{c1::answer}}",
            extra: "Context",
          },
        }),
        {
          fieldNames: ["Front", "Back"],
          isCloze: false,
        },
      ),
    ).toThrow("must target a cloze-compatible note model");
  });
});