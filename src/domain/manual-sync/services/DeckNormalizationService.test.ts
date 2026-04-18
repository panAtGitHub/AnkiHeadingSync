import { describe, expect, it } from "vitest";

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

    expect(() => service.normalize(" / :: ")).toThrow("Deck 不能为空");
  });
});