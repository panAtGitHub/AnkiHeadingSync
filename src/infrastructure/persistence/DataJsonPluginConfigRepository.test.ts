import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";

import { DataJsonPluginConfigRepository, type PluginDataSnapshot } from "./DataJsonPluginConfigRepository";

class InMemoryPluginDataStore implements PluginDataStore<PluginDataSnapshot> {
  constructor(private snapshot: PluginDataSnapshot | null = null) {}

  async load(): Promise<PluginDataSnapshot | null> {
    return this.snapshot;
  }

  async save(data: PluginDataSnapshot): Promise<void> {
    this.snapshot = data;
  }
}

describe("DataJsonPluginConfigRepository", () => {
  it("loads legacy settings snapshots without noteFieldMappings and defaults scopeMode to all", async () => {
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
    expect(settings.scopeMode).toBe("all");
    expect(settings.includeFolders).toEqual(["cards"]);
    expect(settings.fileDeckEnabled).toBe(false);
    expect(settings.fileDeckMarker).toBe("TARGET DECK");
    expect(settings.fileDeckTemplate).toBe("obsidian::filename");
    expect(settings.fileDeckInsertLocation).toBe("body");
    expect(settings.folderDeckMode).toBe("off");
    expect(settings.qaGroupMarker).toBe("#anki-list");
    expect(settings.cardAnswerCutoffMode).toBe("heading-block");
    expect(settings.semanticQaMarker).toBe("#anki-list-qa");
    expect(settings.semanticQaNoteType).toBe("Semantic QA");
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

  it("persists semantic QA settings and mappings across save and reload", async () => {
    const store = new InMemoryPluginDataStore();
    const repository = new DataJsonPluginConfigRepository(store);

    await repository.save({
      ...DEFAULT_SETTINGS,
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
    });

    const reloaded = await repository.load();

    expect(reloaded.cardAnswerCutoffMode).toBe("double-blank-lines");
    expect(reloaded.semanticQaMarker).toBe("#semantic-qa");
    expect(reloaded.semanticQaNoteType).toBe("Semantic QA");
    expect(reloaded.noteFieldMappings).toEqual({
      "semantic-qa:Semantic QA": {
        cardType: "semantic-qa",
        modelName: "Semantic QA",
        loadedFieldNames: ["Title", "Body"],
        titleField: "Title",
        bodyField: "Body",
        loadedAt: 456,
      },
    });
  });
});