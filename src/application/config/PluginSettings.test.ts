import { describe, expect, it } from "vitest";

import { QA_GROUP_MODEL_NAME } from "@/application/config/ManagedNoteModels";
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

  it("allows equal heading levels when marker and default rows remain unambiguous", () => {
    expect(() => validatePluginSettings({
      ...DEFAULT_SETTINGS,
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          headingLevel: DEFAULT_SETTINGS.cardTypeConfigs.basic.headingLevel,
          extraMarker: "#cloze",
        },
      },
    })).not.toThrow();
  });

  it("rejects multiple enabled default rows on the same heading", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        cardTypeConfigs: {
          ...DEFAULT_SETTINGS.cardTypeConfigs,
          cloze: {
            ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
            headingLevel: DEFAULT_SETTINGS.cardTypeConfigs.basic.headingLevel,
            extraMarker: "",
          },
        },
      });
    }, "errors.settings.cardTypeDefaultConflict");
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
    expect(DEFAULT_SETTINGS.ankiNoteTypeCache).toEqual([]);
    expect(DEFAULT_SETTINGS.ankiModelFieldCache).toEqual({});
    expect(DEFAULT_SETTINGS.cardTypeConfigs).toEqual({
      basic: {
        enabled: true,
        headingLevel: 4,
        extraMarker: "",
        noteType: "Basic",
      },
      "qa-group": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-list",
        noteType: QA_GROUP_MODEL_NAME,
      },
      cloze: {
        enabled: true,
        headingLevel: 5,
        extraMarker: "",
        noteType: "Cloze",
      },
      "semantic-qa": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-list-qa",
        noteType: "Semantic QA",
      },
    });
  });

  it("normalizes cached Anki note types on load and save paths", () => {
    const settings = mergePluginSettings({
      ankiNoteTypeCache: ["  Custom Basic  ", "", "Cloze", "Custom Basic"],
    });

    expect(settings.ankiNoteTypeCache).toEqual(["Cloze", "Custom Basic"]);
    expect(normalizePluginSettings({
      ...DEFAULT_SETTINGS,
      ankiNoteTypeCache: ["Basic", "  ", "Cloze", "Basic"],
    }).ankiNoteTypeCache).toEqual(["Basic", "Cloze"]);
  });

  it("normalizes cached Anki model fields on load and save paths", () => {
    const settings = mergePluginSettings({
      ankiModelFieldCache: {
        "  Custom Basic  ": {
          fieldNames: [" Front ", "", "Back", "Front"],
          loadedAt: 123,
        },
        Cloze: {
          fieldNames: [" Text ", "Extra", "Text"],
          loadedAt: Number.NaN,
        },
        "   ": {
          fieldNames: ["Ignored"],
          loadedAt: 999,
        },
      },
    });

    expect(settings.ankiModelFieldCache).toEqual({
      Cloze: {
        fieldNames: ["Text", "Extra"],
        loadedAt: 0,
      },
      "Custom Basic": {
        fieldNames: ["Front", "Back"],
        loadedAt: 123,
      },
    });

    expect(normalizePluginSettings({
      ...DEFAULT_SETTINGS,
      ankiModelFieldCache: {
        Basic: {
          fieldNames: [" Title ", "Body", "Title"],
          loadedAt: 456,
        },
        "Custom Cloze": {
          fieldNames: "Text" as never,
          loadedAt: "invalid" as never,
        },
      },
    }).ankiModelFieldCache).toEqual({
      Basic: {
        fieldNames: ["Title", "Body"],
        loadedAt: 456,
      },
      "Custom Cloze": {
        fieldNames: [],
        loadedAt: 0,
      },
    });
  });

  it("rejects invalid cached Anki note type lists", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiNoteTypeCache: "Basic" as never,
      });
    }, "errors.settings.ankiNoteTypeCacheArray");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiNoteTypeCache: ["Basic", 1] as never,
      });
    }, "errors.settings.ankiNoteTypeCacheStrings");
  });

  it("rejects invalid cached Anki model field maps", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiModelFieldCache: "Basic" as never,
      });
    }, "errors.settings.ankiModelFieldCacheObject");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiModelFieldCache: {
          Basic: [] as never,
        },
      });
    }, "errors.settings.ankiModelFieldCacheEntryObject");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiModelFieldCache: {
          Basic: {
            fieldNames: "Front" as never,
            loadedAt: 1,
          },
        },
      });
    }, "errors.settings.ankiModelFieldCacheFieldNamesArray");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiModelFieldCache: {
          Basic: {
            fieldNames: ["Front", 1] as never,
            loadedAt: 1,
          },
        },
      });
    }, "errors.settings.ankiModelFieldCacheFieldNamesStrings");

    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        ankiModelFieldCache: {
          Basic: {
            fieldNames: ["Front"],
            loadedAt: "invalid" as never,
          },
        },
      });
    }, "errors.settings.ankiModelFieldCacheLoadedAt");
  });

  it("fills new backlink defaults when loading legacy snapshots", () => {
    const settings = mergePluginSettings({
      qaNoteType: "Legacy Basic",
      clozeNoteType: "Legacy Cloze",
    });

    expect(settings.obsidianBacklinkLabel).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
    expect(settings.obsidianBacklinkPlacement).toBe("answer-last-line");
    expect(settings.cardTypeConfigs).toEqual({
      basic: {
        enabled: true,
        headingLevel: 4,
        extraMarker: "",
        noteType: "Legacy Basic",
      },
      "qa-group": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-list",
        noteType: QA_GROUP_MODEL_NAME,
      },
      cloze: {
        enabled: true,
        headingLevel: 5,
        extraMarker: "",
        noteType: "Legacy Cloze",
      },
      "semantic-qa": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-list-qa",
        noteType: "Semantic QA",
      },
    });
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
    expect(() => validatePluginSettings({
      ...DEFAULT_SETTINGS,
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        "qa-group": {
          ...DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
          extraMarker: "anki-list",
        },
      },
    })).not.toThrow();
  });

  it("preserves user-selected QA Group model during normalization", () => {
    const settings = mergePluginSettings({
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        "qa-group": {
          ...DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
          noteType: "Custom QA Group",
        },
      },
    });

    expect(settings.cardTypeConfigs["qa-group"].noteType).toBe("Custom QA Group");
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
