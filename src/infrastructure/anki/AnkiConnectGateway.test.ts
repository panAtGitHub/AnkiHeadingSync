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
});