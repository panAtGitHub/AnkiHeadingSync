import { describe, expect, it } from "vitest";

import { formatList, resolvePluginLocale } from "./locale";

describe("locale", () => {
  it("returns zh for zh-based language codes", () => {
    expect(resolvePluginLocale("zh")).toBe("zh");
    expect(resolvePluginLocale("zh-CN")).toBe("zh");
    expect(resolvePluginLocale("zh-TW")).toBe("zh");
  });

  it("falls back to en for every other language code", () => {
    for (const language of ["en", "en-GB", "ja"]) {
      expect(resolvePluginLocale(language)).toBe("en");
    }
  });

  it("formats lists with locale-specific separators", () => {
    expect(formatList("en", ["A", "B", "C"])).toBe("A, B, C");
    expect(formatList("zh", ["甲", "乙", "丙"])).toBe("甲、乙、丙");
  });
});