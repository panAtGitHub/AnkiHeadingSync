import { describe, expect, it } from "vitest";

import { PluginUserError } from "@/application/errors/PluginUserError";

import {
  DEFAULT_OBSIDIAN_BACKLINK_LABEL,
  DEFAULT_SETTINGS,
  mergePluginSettings,
  normalizeObsidianBacklinkLabel,
  normalizePluginSettings,
  validatePluginSettings,
} from "./PluginSettings";

function expectPluginUserError(action: () => void, key: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginUserError);
    expect((error as PluginUserError).userMessage.key).toBe(key);
    return;
  }

  throw new Error(`Expected PluginUserError for key: ${key}`);
}

describe("PluginSettings", () => {
  it("accepts the default V1 settings", () => {
    expect(() => validatePluginSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it("rejects equal QA and Cloze heading levels", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaHeadingLevel: 4,
        clozeHeadingLevel: 4,
      });
    }, "errors.settings.headingLevelsDifferent");
  });

  it("rejects invalid scope modes", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        scopeMode: "invalid" as never,
      });
    }, "errors.settings.scopeModeInvalid");
  });

  it("includes module 5 defaults", () => {
    expect(DEFAULT_SETTINGS.fileDeckEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.fileDeckMarker).toBe("TARGET DECK");
    expect(DEFAULT_SETTINGS.fileDeckTemplate).toBe("obsidian::filename");
    expect(DEFAULT_SETTINGS.fileDeckInsertLocation).toBe("body");
    expect(DEFAULT_SETTINGS.folderDeckMode).toBe("off");
    expect(DEFAULT_SETTINGS.qaGroupMarker).toBe("#anki-list");
    expect(DEFAULT_SETTINGS.cardAnswerCutoffMode).toBe("heading-block");
    expect(DEFAULT_SETTINGS.obsidianBacklinkLabel).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
    expect(DEFAULT_SETTINGS.obsidianBacklinkPlacement).toBe("answer-last-line");
    expect(DEFAULT_SETTINGS.syncObsidianTagsToAnki).toBe(true);
    expect(DEFAULT_SETTINGS.keepPureTagLinesInCardBody).toBe(true);
  });

  it("fills new backlink defaults when loading legacy snapshots", () => {
    const settings = mergePluginSettings({
      qaNoteType: "Legacy Basic",
      clozeNoteType: "Legacy Cloze",
    });

    expect(settings.obsidianBacklinkLabel).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
    expect(settings.obsidianBacklinkPlacement).toBe("answer-last-line");
  });

  it("rejects invalid backlink placement values", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        obsidianBacklinkPlacement: "body-middle" as never,
      });
    }, "errors.settings.obsidianBacklinkPlacementInvalid");
  });

  it("normalizes blank backlink labels on load and save paths", () => {
    expect(normalizeObsidianBacklinkLabel("   ")).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
    expect(normalizePluginSettings({
      ...DEFAULT_SETTINGS,
      obsidianBacklinkLabel: "  Custom Link  ",
    }).obsidianBacklinkLabel).toBe("Custom Link");
    expect(mergePluginSettings({
      qaNoteType: "Basic",
      clozeNoteType: "Cloze",
      obsidianBacklinkLabel: "\n\t  ",
    }).obsidianBacklinkLabel).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
  });

  it("rejects non-boolean tag sync settings", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        syncObsidianTagsToAnki: "yes" as never,
      });
    }, "errors.settings.syncObsidianTagsToAnkiBoolean");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        keepPureTagLinesInCardBody: 1 as never,
      });
    }, "errors.settings.keepPureTagLinesInCardBodyBoolean");
  });

  it("rejects invalid QA Group markers and semantic marker collisions", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaGroupMarker: "anki-list",
      });
    }, "errors.settings.qaGroupMarkerInvalid");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        qaGroupMarker: "#anki-list-qa",
      });
    }, "errors.settings.qaGroupMarkerConflict");
  });

  it("rejects invalid module 5 enum values", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        fileDeckInsertLocation: "middle" as never,
      });
    }, "errors.settings.fileDeckInsertLocationInvalid");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        folderDeckMode: "tree" as never,
      });
    }, "errors.settings.folderDeckModeInvalid");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        cardAnswerCutoffMode: "marker-only" as never,
      });
    }, "errors.settings.cardAnswerCutoffModeInvalid");
  });
});