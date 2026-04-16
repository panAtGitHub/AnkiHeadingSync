import { describe, expect, it } from "vitest";

import { DeckResolutionService } from "./DeckResolutionService";

describe("DeckResolutionService", () => {
  it("prefers the file deck hint", () => {
    const service = new DeckResolutionService();

    expect(service.resolve("Scoped::Deck", "Default")).toBe("Scoped::Deck");
  });

  it("falls back to the default deck", () => {
    const service = new DeckResolutionService();

    expect(service.resolve(undefined, "Default")).toBe("Default");
  });
});