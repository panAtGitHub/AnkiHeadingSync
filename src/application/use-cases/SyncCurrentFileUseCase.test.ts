import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type PluginSettings } from "@/application/config/PluginSettings";
import type { AnkiGateway } from "@/application/ports/AnkiGateway";
import type { PluginDataStore } from "@/application/ports/PluginDataStore";
import type { VaultGateway } from "@/application/ports/VaultGateway";
import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";
import { DataJsonSyncRegistryRepository } from "@/infrastructure/persistence/DataJsonSyncRegistryRepository";
import type { PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";

import { ExecuteSyncPlanUseCase } from "./ExecuteSyncPlanUseCase";
import { ScanAndPlanSyncUseCase } from "./ScanAndPlanSyncUseCase";
import { SyncCurrentFileUseCase } from "./SyncCurrentFileUseCase";

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

  resolveEmbed(rawTarget: string) {
    if (rawTarget.includes(".png")) {
      return { kind: "image" as const, fileName: "diagram.png", absolutePath: "/vault/diagram.png" };
    }

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
  public readonly storedMedia: string[] = [];
  public deleteCalls = 0;

  async ensureDeckExists(deckName: string): Promise<void> {
    this.ensureDeckCalls.push(deckName);
  }

  async getModelDetails(modelName: string) {
    return modelName === "Cloze"
      ? { fieldNames: ["Text", "Extra"], isCloze: true }
      : { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async addNote(input: { deckName: string; modelName: string; fields: Record<string, string> }): Promise<number> {
    this.addCalls.push(input);
    return 500 + this.addCalls.length;
  }

  async updateNote(input: { noteId: number; deckName: string; fields: Record<string, string> }): Promise<void> {
    this.updateCalls.push(input);
  }

  async storeMedia(asset: { fileName: string }): Promise<void> {
    this.storedMedia.push(asset.fileName);
  }
}

function createSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    addObsidianBacklink: false,
    ...overrides,
  };
}

describe("SyncCurrentFileUseCase", () => {
  it("syncs only the requested file and marks only in-scope orphans", async () => {
    const store = new InMemoryPluginDataStore({
      syncRegistry: {
        records: [
          {
            cardKey: createCardKey("legacy-current"),
            noteId: 101,
            filePath: "notes/current.md",
            sourceHash: createContentHash("old-hash"),
            lastSyncedAt: 1,
            orphan: false,
          },
          {
            cardKey: createCardKey("other-file"),
            noteId: 102,
            filePath: "notes/other.md",
            sourceHash: createContentHash("other-hash"),
            lastSyncedAt: 1,
            orphan: false,
          },
        ],
      },
    });
    const vaultGateway = new FakeVaultGateway([
      {
        path: "notes/current.md",
        content: ["#### Prompt", "Answer with ![[diagram.png]]"].join("\n"),
      },
      {
        path: "notes/other.md",
        content: ["#### Other", "Other answer"].join("\n"),
      },
    ]);
    const ankiGateway = new FakeAnkiGateway();
    const repository = new DataJsonSyncRegistryRepository(store);
    const scanUseCase = new ScanAndPlanSyncUseCase(vaultGateway, repository);
    const executeUseCase = new ExecuteSyncPlanUseCase(ankiGateway, repository, undefined, () => 1000);
    const useCase = new SyncCurrentFileUseCase(scanUseCase, executeUseCase);

    const result = await useCase.execute("notes/current.md", createSettings());
    const snapshot = store.readSnapshot();

    expect(result.created).toBe(1);
    expect(result.markedOrphan).toBe(1);
    expect(result.uploadedMedia).toBe(1);
    expect(ankiGateway.addCalls).toHaveLength(1);
    expect(ankiGateway.updateCalls).toHaveLength(0);
    expect(ankiGateway.deleteCalls).toBe(0);
    expect(snapshot?.syncRegistry?.records.find((record) => record.filePath === "notes/current.md" && record.orphan)).toBeTruthy();
    expect(snapshot?.syncRegistry?.records.find((record) => record.filePath === "notes/other.md" && record.orphan)).toBeFalsy();
  });
});