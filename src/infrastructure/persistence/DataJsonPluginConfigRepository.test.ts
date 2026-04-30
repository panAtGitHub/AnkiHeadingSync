import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";

import { DataJsonPluginConfigRepository, type PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

class InMemoryPluginDataStore implements PluginDataStore<PluginDataSnapshot> {
  constructor(private snapshot: PluginDataSnapshot | null = null) {}

  load(): Promise<PluginDataSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  save(data: PluginDataSnapshot): Promise<void> {
    this.snapshot = data;
    return Promise.resolve();
  }
}

describe("DataJsonPluginConfigRepository", () => {
  it("loads legacy settings snapshots without noteFieldMappings and defaults scopeMode to include", async () => {
    const repository = new DataJsonPluginConfigRepository(
      new InMemoryPluginDataStore({
        settings: {
          qaNoteType: "Legacy Basic",
          clozeNoteType: "Legacy Cloze",
          includeFolders: ["cards"],
        },
      }),
    );

    const settings = await repository.load();

    expect(settings.qaNoteType).toBe("Legacy Basic");
    expect(settings.clozeNoteType).toBe("Legacy Cloze");
    expect(settings.noteFieldMappings).toEqual({});
    expect(settings.scopeMode).toBe("include");
    expect(settings.includeFolders).toEqual(["cards"]);
    expect(settings.fileDeckEnabled).toBe(false);
    expect(settings.fileDeckMarker).toBe("TARGET DECK");
    expect(settings.fileDeckTemplate).toBe("obsidian::filename");
    expect(settings.fileDeckInsertLocation).toBe("body");
    expect(settings.folderDeckMode).toBe("folder-and-file");
    expect(settings.qaGroupMarker).toBe("#anki-list");
    expect(settings.cardAnswerCutoffMode).toBe("heading-block");
    expect(settings.obsidianBacklinkLabel).toBe("Open in Obsidian");
    expect(settings.obsidianBacklinkPlacement).toBe("answer-last-line");
    expect(settings.ankiModelFieldCache).toEqual({});
  });

  it("preserves an explicit existing folderDeckMode value on load", async () => {
    const repository = new DataJsonPluginConfigRepository(
      new InMemoryPluginDataStore({
        settings: {
          folderDeckMode: "off",
        },
      }),
    );

    const settings = await repository.load();

    expect(settings.folderDeckMode).toBe("off");
  });

  it("persists alternate folder deck mode overrides across save and reload", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonPluginConfigRepository(store);

    await repository.save({
      ...DEFAULT_SETTINGS,
      alternateFolderDeckModeFolders: ["notes", "notes/sub"],
    });

    const reloaded = await repository.load();

    expect(reloaded.alternateFolderDeckModeFolders).toEqual(["notes", "notes/sub"]);
  });

  it("normalizes blank backlink labels on load and save", async () => {
    const store = new InMemoryPluginDataStore({
      settings: {
        obsidianBacklinkLabel: "   ",
      },
    });
    const repository = new DataJsonPluginConfigRepository(store);

    const loaded = await repository.load();

    expect(loaded.obsidianBacklinkLabel).toBe("Open in Obsidian");

    await repository.save({
      ...loaded,
      obsidianBacklinkLabel: "  Custom Label  ",
    });

    const reloaded = await repository.load();

    expect(reloaded.obsidianBacklinkLabel).toBe("Custom Label");
  });

  it("persists note field mappings across save and reload", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonPluginConfigRepository(store);

    await repository.save({
      ...DEFAULT_SETTINGS,
      noteFieldMappings: {
        "basic:Basic": {
          cardType: "basic",
          modelName: "Basic",
          loadedFieldNames: ["Front", "Back"],
          titleField: "Front",
          bodyField: "Back",
          loadedAt: 123,
        },
      },
    });

    const reloaded = await repository.load();

    expect(reloaded.noteFieldMappings).toEqual({
      "basic:Basic": {
        cardType: "basic",
        modelName: "Basic",
        loadedFieldNames: ["Front", "Back"],
        titleField: "Front",
        bodyField: "Back",
        loadedAt: 123,
      },
    });
  });

  it("persists cached Anki model fields across save and reload", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonPluginConfigRepository(store);

    await repository.save({
      ...DEFAULT_SETTINGS,
      ankiModelFieldCache: {
        Basic: {
          fieldNames: ["Front", "Back"],
          loadedAt: 123,
        },
        Cloze: {
          fieldNames: ["Text", "Extra"],
          loadedAt: 456,
        },
      },
    });

    const reloaded = await repository.load();

    expect(reloaded.ankiModelFieldCache).toEqual({
      Basic: {
        fieldNames: ["Front", "Back"],
        loadedAt: 123,
      },
      Cloze: {
        fieldNames: ["Text", "Extra"],
        loadedAt: 456,
      },
    });
  });

  it("drops removed semantic QA config fields and mappings during load normalization", async () => {
    const repository = new DataJsonPluginConfigRepository(new InMemoryPluginDataStore({
      settings: {
        cardAnswerCutoffMode: "double-blank-lines",
        semanticQaMarker: "#semantic-qa",
        semanticQaNoteType: "Semantic QA",
        noteFieldMappings: {
          "semantic-qa:Semantic QA": {
            cardType: "semantic-qa",
            modelName: "Semantic QA",
            loadedFieldNames: ["Title", "Body"],
            titleField: "Title",
            bodyField: "Body",
            loadedAt: 456,
          },
        },
      } as never,
    }));

    const reloaded = await repository.load();

    expect(reloaded.cardAnswerCutoffMode).toBe("double-blank-lines");
    expect(reloaded.noteFieldMappings).toEqual({});
    expect("semantic-qa" in reloaded.cardTypeConfigs).toBe(false);
  });
});
