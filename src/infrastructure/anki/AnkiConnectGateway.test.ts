import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestUrlMock } = vi.hoisted(() => ({
  requestUrlMock: vi.fn(),
}));

vi.mock("obsidian", () => ({
  requestUrl: requestUrlMock,
}));

import { AnkiConnectGateway } from "./AnkiConnectGateway";

describe("AnkiConnectGateway", () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
  });

  it("loads note type names from AnkiConnect", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: ["Basic", "Cloze", "Custom Basic"],
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const models = await gateway.listNoteModels();

    expect(models).toEqual(["Basic", "Cloze", "Custom Basic"]);
    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "modelNames",
      version: 6,
      params: {},
    });
  });

  it("loads deck names from AnkiConnect", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: ["Default", "Scoped::Deck"],
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const deckNames = await gateway.listDeckNames();

    expect(deckNames).toEqual(["Default", "Scoped::Deck"]);
    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "deckNames",
      version: 6,
      params: {},
    });
  });

  it("loads model fields and detects cloze templates", async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        json: {
          error: null,
          result: ["Text", "Extra"],
        },
      })
      .mockResolvedValueOnce({
        json: {
          error: null,
          result: {
            "Cloze Card": {},
          },
        },
      });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const details = await gateway.getModelDetails("My Cloze");

    expect(details).toEqual({
      fieldNames: ["Text", "Extra"],
      isCloze: true,
    });
  });

  it("returns note existence and model summaries", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: [
          { noteId: 100, modelName: "Basic", cards: [1] },
          null,
          { noteId: 102, modelName: "Cloze", cards: [2] },
        ],
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const summaries = await gateway.getNoteSummaries([100, 101, 102]);

    expect(summaries).toEqual([
      { noteId: 100, modelName: "Basic", cardIds: [1] },
      { noteId: 102, modelName: "Cloze", cardIds: [2] },
    ]);
    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "notesInfo",
      version: 6,
      params: {
        notes: [100, 101, 102],
      },
    });
  });

  it("maps deck stats into empty-deck detection shape", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: {
          Empty: { total_in_deck: 0 },
          Busy: { total_in_deck: 3 },
        },
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const stats = await gateway.getDeckStats(["Empty", "Busy"]);

    expect(stats).toEqual([
      { deckName: "Empty", noteCount: 0 },
      { deckName: "Busy", noteCount: 3 },
    ]);
    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "getDeckStats",
      version: 6,
      params: {
        decks: ["Empty", "Busy"],
      },
    });
  });

  it("does not treat missing requested deck stats as empty", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: {
          Empty: { total_in_deck: 0 },
        },
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const stats = await gateway.getDeckStats(["Empty", "Missing"]);

    expect(stats).toEqual([
      { deckName: "Empty", noteCount: 0 },
      { deckName: "Missing", noteCount: undefined },
    ]);
  });

  it("treats an empty stats object as unknown instead of empty", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: {},
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const stats = await gateway.getDeckStats(["Deck A", "Deck B"]);

    expect(stats).toEqual([
      { deckName: "Deck A", noteCount: undefined },
      { deckName: "Deck B", noteCount: undefined },
    ]);
  });

  it("treats malformed deck stats entries as unknown instead of zero", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: {
          Broken: {},
          WrongType: { total_in_deck: "0" },
          Empty: { total_in_deck: 0 },
        },
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const stats = await gateway.getDeckStats(["Broken", "WrongType", "Empty"]);

    expect(stats).toEqual([
      { deckName: "Broken", noteCount: undefined },
      { deckName: "WrongType", noteCount: undefined },
      { deckName: "Empty", noteCount: 0 },
    ]);
  });

  it("batches add note calls through AnkiConnect multi", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: [9001, 9002],
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    const noteIds = await gateway.addNotes([
      {
        deckName: "Deck",
        modelName: "Basic",
        fields: { Front: "A", Back: "B" },
        tags: [],
      },
      {
        deckName: "Deck",
        modelName: "Basic",
        fields: { Front: "C", Back: "D" },
        tags: ["tag"],
      },
    ]);

    expect(noteIds).toEqual([9001, 9002]);
    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "multi",
      version: 6,
      params: {
        actions: [
          {
            action: "addNote",
            params: {
              note: {
                deckName: "Deck",
                modelName: "Basic",
                fields: { Front: "A", Back: "B" },
                options: {
                  allowDuplicate: false,
                  duplicateScope: "deck",
                },
                tags: [],
              },
            },
          },
          {
            action: "addNote",
            params: {
              note: {
                deckName: "Deck",
                modelName: "Basic",
                fields: { Front: "C", Back: "D" },
                options: {
                  allowDuplicate: false,
                  duplicateScope: "deck",
                },
                tags: ["tag"],
              },
            },
          },
        ],
      },
    });
  });

  it("batches update, changeDeck, and media operations through multi", async () => {
    requestUrlMock.mockResolvedValue({
      json: {
        error: null,
        result: [null, null],
      },
    });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    await gateway.updateNotes([
      {
        noteId: 10,
        deckName: "Deck A",
        fields: { Front: "Prompt", Back: "Answer" },
      },
    ]);
    await gateway.changeDecks([
      {
        deckName: "Deck B",
        cardIds: [1, 2],
      },
    ]);
    await gateway.storeMediaFiles([
      {
        kind: "image",
        fileName: "asset.png",
        absolutePath: "/tmp/asset.png",
      },
    ]);

    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "multi",
      version: 6,
      params: {
        actions: [
          {
            action: "updateNoteFields",
            params: {
              note: {
                id: 10,
                fields: { Front: "Prompt", Back: "Answer" },
              },
            },
          },
        ],
      },
    });
    expect(JSON.parse(requestUrlMock.mock.calls[1][0].body)).toEqual({
      action: "multi",
      version: 6,
      params: {
        actions: [
          {
            action: "changeDeck",
            params: {
              cards: [1, 2],
              deck: "Deck B",
            },
          },
        ],
      },
    });
    expect(JSON.parse(requestUrlMock.mock.calls[2][0].body)).toEqual({
      action: "multi",
      version: 6,
      params: {
        actions: [
          {
            action: "storeMediaFile",
            params: {
              filename: "asset.png",
              path: "/tmp/asset.png",
            },
          },
        ],
      },
    });
  });

  it("deletes notes and empty decks through direct actions", async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        json: {
          error: null,
          result: null,
        },
      })
      .mockResolvedValueOnce({
        json: {
          error: null,
          result: null,
        },
      });

    const gateway = new AnkiConnectGateway(() => "http://127.0.0.1:8765");
    await gateway.deleteNotes([1, 2]);
    await gateway.deleteDecks(["Empty", "Empty", "Scoped::Deck"]);

    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body)).toEqual({
      action: "deleteNotes",
      version: 6,
      params: {
        notes: [1, 2],
      },
    });
    expect(JSON.parse(requestUrlMock.mock.calls[1][0].body)).toEqual({
      action: "deleteDecks",
      version: 6,
      params: {
        decks: ["Empty", "Scoped::Deck"],
        cardsToo: false,
      },
    });
  });
});