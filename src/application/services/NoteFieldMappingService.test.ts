import { describe, expect, it } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { PluginUserError } from "@/application/errors/PluginUserError";
import type { CardType } from "@/domain/card/entities/RenderedFields";

import { NoteFieldMappingService } from "./NoteFieldMappingService";

interface RenderedCardInput {
  type: CardType;
  noteModel: string;
  renderedFields: {
    title: string;
    body: string;
  };
}

function createCard(overrides: Partial<RenderedCardInput>): RenderedCardInput {
  return {
    type: "basic",
    noteModel: "Basic",
    renderedFields: {
      title: "Prompt",
      body: "Answer",
    },
    ...overrides,
  };
}

function expectPluginUserError(action: () => void): PluginUserError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginUserError);
    return error as PluginUserError;
  }

  throw new Error("Expected PluginUserError");
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
        noteModel: "Cloze",
        renderedFields: {
          title: "Context",
          body: "{{c1::answer}}",
        },
      }),
      {
        fieldNames: ["Text", "Extra"],
        isCloze: false,
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

  it("throws when a cloze main field is missing from the saved mapping", () => {
    const service = new NoteFieldMappingService();

    const error = expectPluginUserError(() =>
      service.map(
        createCard({
          type: "cloze",
          noteModel: "Cloze",
        }),
        { fieldNames: ["Text", "Extra"], isCloze: false },
        {
          [createNoteFieldMappingKey("cloze", "Cloze")]: {
            cardType: "cloze",
            modelName: "Cloze",
            loadedFieldNames: ["Text", "Extra"],
            mainField: undefined,
            loadedAt: 1,
          },
        },
      ),
    );

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.incompleteSavedMapping.cloze");
    expect(error.userMessage.params).toEqual({ modelName: "Cloze" });
  });

  it("throws when a cloze main field is stale even if isCloze is false", () => {
    const service = new NoteFieldMappingService();

    const error = expectPluginUserError(() =>
      service.map(
        createCard({
          type: "cloze",
          noteModel: "Cloze",
        }),
        { fieldNames: ["Body", "Extra"], isCloze: false },
        {
          [createNoteFieldMappingKey("cloze", "Cloze")]: {
            cardType: "cloze",
            modelName: "Cloze",
            loadedFieldNames: ["Text", "Extra"],
            mainField: "Text",
            loadedAt: 1,
          },
        },
      ),
    );

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.stale");
    expect(error.userMessage.params).toEqual({
      modelName: "Cloze",
      fields: ["\"Text\""],
    });
  });

  it("throws when a mapping is missing", () => {
    const service = new NoteFieldMappingService();

    const error = expectPluginUserError(() =>
      service.map(createCard({}), { fieldNames: ["Front", "Back"], isCloze: false }, {}),
    );

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.missingSavedMapping.basic");
    expect(error.userMessage.params).toEqual({ modelName: "Basic" });
  });

  it("throws when a saved mapping is stale", () => {
    const service = new NoteFieldMappingService();

    const error = expectPluginUserError(() =>
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
    );

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.stale");
    expect(error.userMessage.params).toEqual({
      modelName: "Basic",
      fields: ["\"Back\""],
    });
  });

  it("throws when a basic mapping reuses the same field for title and body", () => {
    const service = new NoteFieldMappingService();

    const error = expectPluginUserError(() =>
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
    );

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.titleBodyMustDiffer.basic");
    expect(error.userMessage.params).toEqual({ modelName: "Basic" });
  });
});