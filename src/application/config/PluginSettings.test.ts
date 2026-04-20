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

  it("rejects invalid scope modes", () => {
    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        scopeMode: "invalid" as never,
      }),
    ).toThrow("Scope mode must be one of all, include, or exclude.");
  });

  it("includes module 5 defaults", () => {
    expect(DEFAULT_SETTINGS.fileDeckEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.fileDeckMarker).toBe("TARGET DECK");
    expect(DEFAULT_SETTINGS.fileDeckTemplate).toBe("obsidian::filename");
    expect(DEFAULT_SETTINGS.fileDeckInsertLocation).toBe("body");
    expect(DEFAULT_SETTINGS.folderDeckMode).toBe("off");
    expect(DEFAULT_SETTINGS.qaGroupMarker).toBe("#anki-list");
  });

  it("rejects invalid QA Group markers and semantic marker collisions", () => {
    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaGroupMarker: "anki-list",
      }),
    ).toThrow("QA Group marker must be a hashtag-style token like #anki-list.");

    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaGroupMarker: "#anki-list-qa",
      }),
    ).toThrow("QA Group marker must be different from Semantic QA marker.");
  });

  it("rejects invalid module 5 enum values", () => {
    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        fileDeckInsertLocation: "middle" as never,
      }),
    ).toThrow("File deck insert location must be yaml or body.");

    expect(() =>
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        folderDeckMode: "tree" as never,
      }),
    ).toThrow("Folder deck mode must be off, folder, or folder-and-file.");
  });
});