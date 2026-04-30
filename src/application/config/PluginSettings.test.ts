import { describe, expect, it } from "vitest";

import { PluginUserError } from "@/application/errors/PluginUserError";
import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";

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
    expect(DEFAULT_SETTINGS.folderDeckMode).toBe("folder-and-file");
    expect(DEFAULT_SETTINGS.qaGroupMarker).toBe("#anki-list");
    expect(DEFAULT_SETTINGS.cardAnswerCutoffMode).toBe("heading-block");
    expect(DEFAULT_SETTINGS.alternateFolderDeckModeFolders).toEqual([]);
    expect(DEFAULT_SETTINGS.obsidianBacklinkLabel).toBe(DEFAULT_OBSIDIAN_BACKLINK_LABEL);
    expect(DEFAULT_SETTINGS.obsidianBacklinkPlacement).toBe("answer-last-line");
    expect(DEFAULT_SETTINGS.syncObsidianTagsToAnki).toBe(true);
    expect(DEFAULT_SETTINGS.keepPureTagLinesInCardBody).toBe(true);
    expect(DEFAULT_SETTINGS.scopeMode).toBe("include");
    expect(DEFAULT_SETTINGS.ankiNoteTypeCache).toEqual([]);
    expect(DEFAULT_SETTINGS.ankiModelFieldCache).toEqual({});
    expect(DEFAULT_SETTINGS.cardTypeConfigs).toEqual({
      basic: {
        enabled: true,
        headingLevel: 4,
        extraMarker: "",
        noteType: "",
      },
      "qa-group": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-list",
        noteType: "",
      },
      cloze: {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-cloze",
        noteType: "",
      },
      "cloze-all": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-cloze-all",
        noteType: "",
      },
    });
  });

  it("defaults alternate folder deck mode override folders to an empty array when missing", () => {
    const settings = mergePluginSettings({
      defaultDeck: "Default",
    });

    expect(settings.alternateFolderDeckModeFolders).toEqual([]);
  });

  it("preserves alternate folder deck mode override folders using the current folder-list convention", () => {
    const settings = mergePluginSettings({
      alternateFolderDeckModeFolders: ["notes", "notes/sub", "notes"],
    });

    expect(settings.alternateFolderDeckModeFolders).toEqual(["notes", "notes/sub", "notes"]);
  });

  it("rejects non-array alternate folder deck mode override folders", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        alternateFolderDeckModeFolders: "notes" as never,
      });
    }, "errors.settings.alternateFolderDeckModeFoldersArray");
  });

  it("rejects non-string alternate folder deck mode override folder entries", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        alternateFolderDeckModeFolders: ["notes", 1] as never,
      });
    }, "errors.settings.alternateFolderDeckModeFoldersStrings");
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

  it("hydrates missing enabled basic and cloze field mappings from cached Anki fields", () => {
    const settings = mergePluginSettings({
      ankiModelFieldCache: {
        "问答题": {
          fieldNames: ["正面", "背面"],
          loadedAt: 10,
        },
        "填空题": {
          fieldNames: ["文字", "背面额外"],
          loadedAt: 20,
        },
      },
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        basic: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.basic,
          noteType: "问答题",
        },
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          noteType: "填空题",
        },
      },
      noteFieldMappings: {},
    });

    expect(settings.noteFieldMappings[createNoteFieldMappingKey("basic", "问答题")]).toEqual(expect.objectContaining({
      titleField: "正面",
      bodyField: "背面",
      loadedAt: 10,
    }));
    expect(settings.noteFieldMappings[createNoteFieldMappingKey("cloze", "填空题")]).toEqual(expect.objectContaining({
      mainField: "文字",
      loadedAt: 20,
    }));
  });

  it("migrates the old default cloze recognition to H4 + #anki-cloze", () => {
    const settings = mergePluginSettings({
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          headingLevel: 5,
          extraMarker: "",
        },
      },
    });

    expect(settings.cardTypeConfigs.cloze).toEqual(expect.objectContaining({
      headingLevel: 4,
      extraMarker: "#anki-cloze",
    }));
  });

  it("migrates legacy cloze H5 snapshots when no per-card recognition override exists", () => {
    const settings = mergePluginSettings({
      clozeHeadingLevel: 5,
      clozeNoteType: "Legacy Cloze",
    });

    expect(settings.cardTypeConfigs.cloze).toEqual(expect.objectContaining({
      headingLevel: 4,
      extraMarker: "#anki-cloze",
      noteType: "Legacy Cloze",
    }));
  });

  it("preserves user customized cloze recognition settings", () => {
    const customizedHeading = mergePluginSettings({
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          headingLevel: 6,
          extraMarker: "",
        },
      },
    });
    expect(customizedHeading.cardTypeConfigs.cloze).toEqual(expect.objectContaining({
      headingLevel: 6,
      extraMarker: "",
    }));

    const customizedMarker = mergePluginSettings({
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          headingLevel: 4,
          extraMarker: "#custom-cloze",
        },
      },
    });
    expect(customizedMarker.cardTypeConfigs.cloze).toEqual(expect.objectContaining({
      headingLevel: 4,
      extraMarker: "#custom-cloze",
    }));
  });

  it("backfills cloze-all and mirrors the shared cloze note type", () => {
    const settings = mergePluginSettings({
      cardTypeConfigs: {
        basic: DEFAULT_SETTINGS.cardTypeConfigs.basic,
        "qa-group": DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          noteType: "Custom Cloze",
        },
      } as never,
    });

    expect(settings.cardTypeConfigs["cloze-all"]).toEqual({
      enabled: true,
      headingLevel: 4,
      extraMarker: "#anki-cloze-all",
      noteType: "Custom Cloze",
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
        noteType: "",
      },
      cloze: {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-cloze",
        noteType: "Legacy Cloze",
      },
      "cloze-all": {
        enabled: true,
        headingLevel: 4,
        extraMarker: "#anki-cloze-all",
        noteType: "Legacy Cloze",
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

  it("accepts custom QA Group markers during validation", () => {
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

  it("allows empty basic qa-group and cloze note types in saved settings", () => {
    expect(() => validatePluginSettings({
      ...DEFAULT_SETTINGS,
      cardTypeConfigs: {
        ...DEFAULT_SETTINGS.cardTypeConfigs,
        basic: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.basic,
          noteType: "",
        },
        "qa-group": {
          ...DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
          noteType: "",
        },
        cloze: {
          ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
          noteType: "",
        },
      },
    })).not.toThrow();
  });

  it("normalizes legacy qa-group mappings into the new slot structure", () => {
    const settings = mergePluginSettings({
      noteFieldMappings: {
        "qa-group:Custom QA Group": {
          cardType: "qa-group",
          modelName: "Custom QA Group",
          loadedFieldNames: ["题目", "问题01", "答案01", "问题02", "答案02"],
          titleField: "题目",
          bodyField: "答案01",
          loadedAt: 1,
        } as never,
      },
    });

    expect(settings.noteFieldMappings["qa-group:Custom QA Group"]).toEqual({
      cardType: "qa-group",
      modelName: "Custom QA Group",
      loadedFieldNames: ["题目", "问题01", "答案01", "问题02", "答案02"],
      titleField: "题目",
      derivation: {
        mode: "first-pair",
        firstQuestionField: "问题01",
        firstAnswerField: "答案01",
      },
      slots: [
        { index: 1, questionField: "问题01", answerField: "答案01" },
        { index: 2, questionField: "问题02", answerField: "答案02" },
      ],
      warnings: [],
      acceptedWarnings: undefined,
      loadedAt: 1,
    });
  });

  it("rejects invalid qa-group slot metadata in note field mappings", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        noteFieldMappings: {
          "qa-group:Custom QA Group": {
            cardType: "qa-group",
            modelName: "Custom QA Group",
            loadedFieldNames: ["题目", "问题01", "答案01"],
            titleField: "题目",
            slots: [{ index: 0, questionField: "问题01", answerField: "答案01" }],
            warnings: [],
            loadedAt: 1,
          },
        },
      });
    }, "errors.settings.noteFieldMappingsQaGroupSlotIndex");
  });

  it("rejects invalid qa-group derivation metadata in note field mappings", () => {
    expectPluginUserError(() => {
      validatePluginSettings({
        ...DEFAULT_SETTINGS,
        noteFieldMappings: {
          "qa-group:Custom QA Group": {
            cardType: "qa-group",
            modelName: "Custom QA Group",
            loadedFieldNames: ["题目", "问题01", "答案01"],
            titleField: "题目",
            slots: [{ index: 1, questionField: "问题01", answerField: "答案01" }],
            warnings: [],
            derivation: {
              mode: "invalid",
            },
            loadedAt: 1,
          } as never,
        },
      });
    }, "errors.settings.noteFieldMappingsQaGroupDerivationMode");
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
