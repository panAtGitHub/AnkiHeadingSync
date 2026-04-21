import { describe, expect, it } from "vitest";

import { PluginUserError } from "@/application/errors/PluginUserError";

import { DeckNormalizationService } from "./DeckNormalizationService";

describe("DeckNormalizationService", () => {
  it("trims whitespace, removes empty segments, and normalizes folder separators", () => {
    const service = new DeckNormalizationService();

    expect(service.normalize(" 数学/第一章/ ")).toBe("数学::第一章");
    expect(service.normalize("数学::::第一章")).toBe("数学::第一章");
    expect(service.normalize(" 数学:: 第一章 :: ")).toBe("数学::第一章");
  });

  it("rejects empty final deck values", () => {
    const service = new DeckNormalizationService();

    try {
      service.normalize(" / :: ");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginUserError);
      expect((error as PluginUserError).userMessage.key).toBe("errors.deck.emptyName");
      return;
    }

    throw new Error("Expected PluginUserError for empty deck normalization");
  });
});