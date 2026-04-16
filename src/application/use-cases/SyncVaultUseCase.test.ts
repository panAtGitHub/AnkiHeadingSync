import { describe, expect, it } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS, type PluginSettings } from "@/application/config/PluginSettings";
import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import type { VaultGateway } from "@/application/ports/VaultGateway";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";
import { DataJsonSyncRegistryRepository } from "@/infrastructure/persistence/DataJsonSyncRegistryRepository";
import type { PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";

import { ExecuteSyncPlanUseCase } from "./ExecuteSyncPlanUseCase";
import { ScanAndPlanSyncUseCase } from "./ScanAndPlanSyncUseCase";
import { SyncVaultUseCase } from "./SyncVaultUseCase";

class InMemoryPluginDataStore implements PluginDataStore<PluginDataSnapshot> {
  constructor(private snapshot: PluginDataSnapshot | null = null) {}

  async load(): Promise<PluginDataSnapshot | null> {
    return this.snapshot;
  }

  async save(data: PluginDataSnapshot): Promise<void> {
    this.snapshot = data;
  }

  readSnapshot(): PluginDataSnapshot | null {
    return this.snapshot;
  }
}

class FakeVaultGateway implements VaultGateway {
  constructor(private readonly files: Array<{ path: string; content: string }>) {}

  async listMarkdownFiles() {
    return this.files.map((file) => ({
      path: file.path,
      basename: file.path.split("/").pop()?.replace(/\.md$/i, "") ?? file.path,
      content: file.content,
    }));
  }

  async getMarkdownFile(path: string) {
    const file = this.files.find((candidate) => candidate.path === path);
    if (!file) {
      return null;
    }

    return {
      path: file.path,
      basename: file.path.split("/").pop()?.replace(/\.md$/i, "") ?? file.path,
      content: file.content,
    };
  }

  resolveWikiLink(rawTarget: string) {
    return { url: `obsidian://open?vault=Vault&file=${rawTarget}`, displayText: rawTarget.split("|")[1] ?? rawTarget };
  }

  resolveEmbed() {
    return null;
  }

  createBacklink(location: SourceLocation) {
    return `obsidian://open?vault=Vault&file=${encodeURIComponent(location.filePath)}`;
  }
}

class FakeAnkiGateway implements AnkiGateway {
  public readonly addCalls: Array<{ deckName: string; modelName: string; fields: Record<string, string> }> = [];
  public readonly updateCalls: Array<{ noteId: number; deckName: string; fields: Record<string, string> }> = [];
  public readonly ensureDeckCalls: string[] = [];

  async ensureDeckExists(deckName: string): Promise<void> {
    this.ensureDeckCalls.push(deckName);
  }

  async listNoteModels(): Promise<string[]> {
    return ["Basic", "Cloze"];
  }

  async getModelDetails(modelName: string) {
    return modelName === "Cloze"
      ? { fieldNames: ["Text", "Extra"], isCloze: true }
      : { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async addNote(input: { deckName: string; modelName: string; fields: Record<string, string> }): Promise<number> {
    this.addCalls.push(input);
    return 200 + this.addCalls.length;
  }

  async updateNote(input: { noteId: number; deckName: string; fields: Record<string, string> }): Promise<void> {
    this.updateCalls.push(input);
  }

  async storeMedia(): Promise<void> {}
}

function createSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    addObsidianBacklink: false,
    noteFieldMappings: {
      [createNoteFieldMappingKey("basic", "Basic")]: {
        cardType: "basic",
        modelName: "Basic",
        loadedFieldNames: ["Front", "Back"],
        titleField: "Front",
        bodyField: "Back",
        loadedAt: 1,
      },
      [createNoteFieldMappingKey("cloze", "Cloze")]: {
        cardType: "cloze",
        modelName: "Cloze",
        loadedFieldNames: ["Text", "Extra"],
        mainField: "Text",
        loadedAt: 1,
      },
    },
    ...overrides,
  };
}

describe("SyncVaultUseCase", () => {
  it("scans the configured scope and syncs vault cards", async () => {
    const store = new InMemoryPluginDataStore();
    const vaultGateway = new FakeVaultGateway([
      {
        path: "cards/qa.md",
        content: ["TARGET DECK: Scoped::Deck", "", "#### Prompt", "Answer"].join("\n"),
      },
      {
        path: "cards/skip/ignored.md",
        content: ["#### Ignored", "Ignored answer"].join("\n"),
      },
      {
        path: "outside/out.md",
        content: ["#### Outside", "Outside answer"].join("\n"),
      },
    ]);
    const ankiGateway = new FakeAnkiGateway();
    const repository = new DataJsonSyncRegistryRepository(store);
    const scanUseCase = new ScanAndPlanSyncUseCase(vaultGateway, repository);
    const executeUseCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, undefined, () => 2000);
    const useCase = new SyncVaultUseCase(scanUseCase, executeUseCase);

    const result = await useCase.execute(
      createSettings({
        includeFolders: ["cards"],
        excludeFolders: ["cards/skip"],
      }),
    );
    const snapshot = store.readSnapshot();

    expect(result.scanned).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(ankiGateway.ensureDeckCalls).toEqual(["Scoped::Deck"]);
    expect(ankiGateway.addCalls[0]?.deckName).toBe("Scoped::Deck");
    expect(snapshot?.syncRegistry?.records).toHaveLength(1);
    expect(snapshot?.syncRegistry?.records[0]?.filePath).toBe("cards/qa.md");
  });
});