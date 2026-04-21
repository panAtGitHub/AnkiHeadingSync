import * as obsidian from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatList, resolvePluginLocale } from "./locale";

describe("locale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zh only when Obsidian language is exactly zh", () => {
    vi.spyOn(obsidian, "getLanguage").mockReturnValue("zh");

    expect(resolvePluginLocale()).toBe("zh");
  });

  it("falls back to en for every other Obsidian language code", () => {
    const getLanguage = vi.spyOn(obsidian, "getLanguage");

    for (const language of ["en", "en-GB", "ja", "zh-TW"]) {
      getLanguage.mockReturnValue(language);
      expect(resolvePluginLocale()).toBe("en");
    }
  });

  it("formats lists with locale-specific separators", () => {
    expect(formatList("en", ["A", "B", "C"])).toBe("A, B, C");
    expect(formatList("zh", ["甲", "乙", "丙"])).toBe("甲、乙、丙");
  });
});