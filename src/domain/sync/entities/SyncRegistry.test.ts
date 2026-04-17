import { describe, expect, it } from "vitest";

import { createCardKey } from "@/domain/card/value-objects/CardKey";
import { createContentHash } from "@/domain/card/value-objects/ContentHash";

import { SyncRegistry } from "./SyncRegistry";

describe("SyncRegistry", () => {
  it("refreshes an existing record and clears orphan state", () => {
    const registry = new SyncRegistry([
      {
        cardKey: createCardKey("card-1"),
        identityMode: "legacy-card-key",
        noteId: 101,
        filePath: "notes/old.md",
        sourceHash: createContentHash("old-hash"),
        lastSyncedAt: 1,
        orphan: true,
      },
    ]);

    registry.refresh(createCardKey("card-1"), "notes/new.md", createContentHash("new-hash"), 10);

    expect(registry.get(createCardKey("card-1"))).toEqual({
      cardKey: createCardKey("card-1"),
      identityMode: "legacy-card-key",
      noteId: 101,
      filePath: "notes/new.md",
      sourceHash: createContentHash("new-hash"),
      lastSyncedAt: 10,
      orphan: false,
    });
  });

  it("marks an existing record as orphan without deleting it", () => {
    const registry = new SyncRegistry([
      {
        cardKey: createCardKey("card-1"),
        identityMode: "legacy-card-key",
        noteId: 101,
        filePath: "notes/example.md",
        sourceHash: createContentHash("hash"),
        lastSyncedAt: 1,
        orphan: false,
      },
    ]);

    registry.markOrphan(createCardKey("card-1"), 20);

    expect(registry.get(createCardKey("card-1"))?.orphan).toBe(true);
    expect(registry.get(createCardKey("card-1"))?.noteId).toBe(101);
  });

  it("reassigns a note id to the latest card key", () => {
    const registry = new SyncRegistry([
      {
        cardKey: createCardKey("card-1"),
        identityMode: "embedded-note-id",
        noteId: 101,
        filePath: "notes/example.md",
        sourceHash: createContentHash("hash"),
        lastSyncedAt: 1,
        orphan: false,
      },
    ]);

    registry.recordSync({
      cardKey: createCardKey("card-2"),
      identityMode: "embedded-note-id",
      noteId: 101,
      filePath: "notes/renamed.md",
      sourceHash: createContentHash("hash"),
      lastSyncedAt: 2,
      orphan: false,
    });

    expect(registry.get(createCardKey("card-1"))).toBeUndefined();
    expect(registry.get(createCardKey("card-2"))?.noteId).toBe(101);
    expect(registry.findByNoteId(101)?.cardKey).toBe(createCardKey("card-2"));
  });
});