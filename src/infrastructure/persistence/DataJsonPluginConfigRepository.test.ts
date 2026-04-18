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
});