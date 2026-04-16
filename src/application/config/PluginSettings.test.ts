import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, validatePluginSettings } from "./PluginSettings";

describe("PluginSettings", () => {
  it("accepts the default V1 settings", () => {
    expect(() => validatePluginSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it("rejects equal QA and Cloze heading levels", () => {
    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaHeadingLevel: 4,
        clozeHeadingLevel: 4,
      }),
    ).toThrow("QA and Cloze heading levels must be different.");
  });
});