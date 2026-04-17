import { describe, expect, it } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
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
      contentEndLine: 2,
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
      title: "Prompt",
      body: "Answer",
    },
    fields: {
      title: "Prompt",
      body: "Answer",
    },
    contentHash: createContentHash("hash"),
    media: [],
    ...overrides,
  };
}

describe("NoteFieldMappingService", () => {
  it("maps a basic card using a saved title/body mapping", () => {
    const service = new NoteFieldMappingService();
    const card = createCard({});
    const fields = service.map(
      card,
      {
        fieldNames: ["Title", "Body"],
        isCloze: false,
      },
      {
        [createNoteFieldMappingKey("basic", "Basic")]: {
          cardType: "basic",
          modelName: "Basic",
          loadedFieldNames: ["Title", "Body"],
          titleField: "Title",
          bodyField: "Body",
          loadedAt: 1,
        },
      },
    );

    expect(fields).toEqual({ Title: "Prompt", Body: "Answer" });
  });

  it("maps a cloze card into the configured main field using title and body fragments", () => {
    const service = new NoteFieldMappingService();
    const fields = service.map(
      createCard({
        type: "cloze",
        noteModel: createNoteModelName("Cloze"),
        renderedFields: {
          title: "Context",
          body: "{{c1::answer}}",
        },
        fields: {
          title: "Context",
          body: "{{c1::answer}}",
        },
      }),
      {
        fieldNames: ["Text", "Extra"],
        isCloze: true,
      },
      {
        [createNoteFieldMappingKey("cloze", "Cloze")]: {
          cardType: "cloze",
          modelName: "Cloze",
          loadedFieldNames: ["Text", "Extra"],
          mainField: "Text",
          loadedAt: 1,
        },
      },
    );

    expect(fields).toEqual({ Text: "Context<br><br>{{c1::answer}}" });
  });

  it("throws when a mapping is missing", () => {
    const service = new NoteFieldMappingService();

    expect(() =>
      service.map(createCard({}), { fieldNames: ["Front", "Back"], isCloze: false }, {}),
    ).toThrow("Open plugin settings and read fields from Anki first");
  });

  it("throws when a saved mapping is stale", () => {
    const service = new NoteFieldMappingService();

    expect(() =>
      service.map(
        createCard({}),
        { fieldNames: ["Front", "Body"], isCloze: false },
        {
          [createNoteFieldMappingKey("basic", "Basic")]: {
            cardType: "basic",
            modelName: "Basic",
            loadedFieldNames: ["Front", "Back"],
            titleField: "Front",
            bodyField: "Back",
            loadedAt: 1,
          },
        },
      ),
    ).toThrow("is stale because these fields no longer exist in Anki");
  });

  it("throws when a basic mapping reuses the same field for title and body", () => {
    const service = new NoteFieldMappingService();

    expect(() =>
      service.map(
        createCard({}),
        { fieldNames: ["Front", "Back"], isCloze: false },
        {
          [createNoteFieldMappingKey("basic", "Basic")]: {
            cardType: "basic",
            modelName: "Basic",
            loadedFieldNames: ["Front", "Back"],
            titleField: "Front",
            bodyField: "Front",
            loadedAt: 1,
          },
        },
      ),
    ).toThrow('must use different title and body fields');
  });
});