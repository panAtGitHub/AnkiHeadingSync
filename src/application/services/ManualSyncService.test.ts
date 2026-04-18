import { describe, expect, it } from "vitest";

import { ManualSyncService } from "./ManualSyncService";
import { createModule3Settings, FakeManualSyncAnkiGateway, FakeManualSyncVaultGateway, InMemoryPluginStateRepository } from "@/test-support/manualSyncFakes";

describe("ManualSyncService", () => {
  it("syncs one file, creates Anki notes, writes the new marker format, and saves plugin state", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createModule3Settings());

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=");
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("note=9001");
    expect(stateRepository.savedState?.pendingWriteBack).toEqual([]);
    expect(Object.values(stateRepository.savedState?.cards ?? {})).toHaveLength(1);
  });

  it("records pending write-back and reports conflict files when markdown changed before write-back", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    vaultGateway.conflictPaths.add("notes/example.md");
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.syncFile("notes/example.md", createModule3Settings());

    expect(result.markerWriteConflictFiles).toEqual(["notes/example.md"]);
    expect(stateRepository.savedState?.pendingWriteBack).toHaveLength(1);
    expect(stateRepository.savedState?.pendingWriteBack[0]).toMatchObject({ filePath: "notes/example.md", noteId: 9001 });
  });

  it("rebuilds the card index and writes card-only markers without calling Anki", async () => {
    const vaultGateway = new FakeManualSyncVaultGateway({
      "notes/example.md": ["#### Prompt", "Answer"].join("\n"),
    });
    const stateRepository = new InMemoryPluginStateRepository();
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new ManualSyncService(vaultGateway, stateRepository, ankiGateway, undefined, undefined, undefined, undefined, undefined, undefined, () => 1234);

    const result = await service.rebuildIndex(createModule3Settings());

    expect(result.created).toBe(0);
    expect(result.rewrittenMarkers).toBe(1);
    expect(ankiGateway.addedNotes).toHaveLength(0);
    expect(vaultGateway.getFileContent("notes/example.md")).toContain("<!-- AHS:card=");
    expect(vaultGateway.getFileContent("notes/example.md")).not.toContain("note=");
  });
});