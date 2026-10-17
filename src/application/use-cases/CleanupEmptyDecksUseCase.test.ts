import { describe, expect, it, vi } from "vitest";

import { FakeManualSyncAnkiGateway } from "@/test-support/manualSyncFakes";

import { CleanupEmptyDecksUseCase } from "./CleanupEmptyDecksUseCase";

describe("CleanupEmptyDecksUseCase", () => {
  it("preserves ancestors when deleting a child fails", async () => {
    const gateway = new FakeManualSyncAnkiGateway();
    gateway.listedDeckNames = ["Root", "Root::Child"];
    for (const name of gateway.listedDeckNames) gateway.deckStatsByName.set(name, { deckName: name, noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(gateway);
    const candidates = await useCase.listCandidates();
    const deletion = vi.spyOn(gateway, "deleteDecks").mockRejectedValue(new Error("Deletion failed"));
    const result = await useCase.execute(candidates, candidates);
    expect(result.deletedCount).toBe(0);
    expect(result.skippedDeckNames).toEqual(["Root::Child", "Root"]);
    expect(deletion).toHaveBeenCalledExactlyOnceWith(["Root::Child"]);
  });

  it("rechecks a parent after children are deleted and preserves newly added cards", async () => {
    const gateway = new FakeManualSyncAnkiGateway();
    gateway.listedDeckNames = ["Root", "Root::Child"];
    for (const name of gateway.listedDeckNames) gateway.deckStatsByName.set(name, { deckName: name, noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(gateway);
    const candidates = await useCase.listCandidates();
    const originalDelete = gateway.deleteDecks.bind(gateway);
    vi.spyOn(gateway, "deleteDecks").mockImplementation(async (names) => {
      await originalDelete(names);
      gateway.deckStatsByName.set("Root", { deckName: "Root", noteCount: 1 });
    });
    const result = await useCase.execute(candidates, candidates);
    expect(result.deletedDeckNames).toEqual(["Root::Child"]);
    expect(result.skippedDeckNames).toEqual(["Root"]);
  });

  it("preserves parents when a child is unselected, unknown, or newly added", async () => {
    for (const scenario of ["unselected", "unknown", "new"] as const) {
      const gateway = new FakeManualSyncAnkiGateway();
      gateway.listedDeckNames = ["Root", "Root::Child"];
      gateway.deckStatsByName.set("Root", { deckName: "Root", noteCount: 0 });
      gateway.deckStatsByName.set("Root::Child", { deckName: "Root::Child", noteCount: 0 });
      const useCase = new CleanupEmptyDecksUseCase(gateway);
      const candidates = await useCase.listCandidates();
      if (scenario === "unknown") gateway.deckStatsByName.delete("Root::Child");
      if (scenario === "new") gateway.listedDeckNames.push("Root::New");
      const result = await useCase.execute(scenario === "unselected" ? ["Root"] : candidates, candidates);
      expect(result.deletedDeckNames).not.toContain("Root");
      expect(result.skippedDeckNames).toContain("Root");
    }
  });

  it("does not list a parent with unknown descendant stats", async () => {
    const gateway = new FakeManualSyncAnkiGateway();
    gateway.listedDeckNames = ["Root", "Root::Unknown", "Root::Empty"];
    gateway.deckStatsByName.set("Root", { deckName: "Root", noteCount: 0 });
    gateway.deckStatsByName.set("Root::Empty", { deckName: "Root::Empty", noteCount: 0 });
    expect(await new CleanupEmptyDecksUseCase(gateway).listCandidates()).toEqual(["Root::Empty"]);
  });

  it("detects empty decks from Anki stats", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Busy", "Empty", "Another::Empty"];
    ankiGateway.deckStatsByName.set("Busy", { deckName: "Busy", noteCount: 2 });
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Another::Empty", { deckName: "Another::Empty", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual(["Another::Empty", "Empty"]);
  });

  it("deletes only the user-selected empty decks", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Empty", "Another::Empty"];
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Another::Empty", { deckName: "Another::Empty", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();
    const result = await useCase.execute(["Empty"], candidates);

    expect(result).toEqual({
      candidateCount: 2,
      selectedCount: 1,
      deletedCount: 1,
      deletedDeckNames: ["Empty"],
      skippedDeckNames: [],
    });
    expect(ankiGateway.deletedDecks).toEqual([["Empty"]]);
  });

  it("skips decks that disappeared or became non-empty before deletion", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Empty", "Gone"];
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Gone", { deckName: "Gone", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 3 });
    ankiGateway.deckStatsByName.delete("Gone");
    const result = await useCase.execute(["Empty", "Gone"], candidates);

    expect(result.candidateCount).toBe(2);
    expect(result.selectedCount).toBe(2);
    expect(result.deletedCount).toBe(0);
    expect(result.deletedDeckNames).toEqual([]);
    expect(result.skippedDeckNames).toEqual(["Empty", "Gone"]);
    expect(ankiGateway.deletedDecks).toEqual([]);
  });

  it("skips decks with missing stats when building candidates", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Empty", "Busy", "Unknown"];
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Busy", { deckName: "Busy", noteCount: 4 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual(["Empty"]);
  });

  it("includes only decks explicitly confirmed with zero notes", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Empty A", "Busy", "Unknown", "Empty B"];
    ankiGateway.deckStatsByName.set("Empty A", { deckName: "Empty A", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Busy", { deckName: "Busy", noteCount: 2 });
    ankiGateway.deckStatsByName.set("Empty B", { deckName: "Empty B", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual(["Empty A", "Empty B"]);
  });

  it("excludes empty parents with non-empty descendants", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = [
      "999, 试验卡片",
      "999, 试验卡片::试验卡",
      "999, 试验卡片::试验卡2",
      "999, 试验卡片::试验卡11",
    ];
    ankiGateway.deckStatsByName.set("999, 试验卡片", { deckName: "999, 试验卡片", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::试验卡", { deckName: "999, 试验卡片::试验卡", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::试验卡2", { deckName: "999, 试验卡片::试验卡2", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::试验卡11", { deckName: "999, 试验卡片::试验卡11", noteCount: 1 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual([
      "999, 试验卡片::试验卡",
      "999, 试验卡片::试验卡2",
    ]);
  });

  it("deletes a complete empty hierarchy in one run, children first", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = [
      "Parent",
      "Parent::Empty",
      "Parent::Empty::Leaf",
    ];
    ankiGateway.deckStatsByName.set("Parent", { deckName: "Parent", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Parent::Empty", { deckName: "Parent::Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Parent::Empty::Leaf", { deckName: "Parent::Empty::Leaf", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();
    const result = await useCase.execute(candidates, candidates);

    expect(candidates).toEqual(["Parent", "Parent::Empty", "Parent::Empty::Leaf"]);
    expect(result.deletedDeckNames).toEqual(["Parent::Empty::Leaf", "Parent::Empty", "Parent"]);
    expect(result.skippedDeckNames).toEqual([]);
    expect(ankiGateway.deletedDecks).toEqual([["Parent::Empty::Leaf"], ["Parent::Empty"], ["Parent"]]);
  });

  it("excludes intermediate parent decks in deeper hierarchies", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = [
      "999, 试验卡片",
      "999, 试验卡片::试验卡",
      "999, 试验卡片::试验卡片2",
      "999, 试验卡片::课件2",
      "999, 试验卡片::课件2::卡片试验",
      "999, 试验卡片::课件2::未命名1111",
    ];
    ankiGateway.deckStatsByName.set("999, 试验卡片", { deckName: "999, 试验卡片", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::试验卡", { deckName: "999, 试验卡片::试验卡", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::试验卡片2", { deckName: "999, 试验卡片::试验卡片2", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::课件2", { deckName: "999, 试验卡片::课件2", noteCount: 0 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::课件2::卡片试验", { deckName: "999, 试验卡片::课件2::卡片试验", noteCount: 2 });
    ankiGateway.deckStatsByName.set("999, 试验卡片::课件2::未命名1111", { deckName: "999, 试验卡片::课件2::未命名1111", noteCount: 1 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual([
      "999, 试验卡片::试验卡",
      "999, 试验卡片::试验卡片2",
    ]);
  });

  it("returns zero candidates when Anki returns no stats for the listed decks", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Deck A", "Deck B", "Deck C"];
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual([]);
  });

  it("skips selected decks whose current stats are unknown at delete time", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = ["Empty", "Unknown"];
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();
    const result = await useCase.execute(["Empty", "Unknown"], candidates);

    expect(result.candidateCount).toBe(1);
    expect(result.selectedCount).toBe(2);
    expect(result.deletedCount).toBe(1);
    expect(result.deletedDeckNames).toEqual(["Empty"]);
    expect(result.skippedDeckNames).toEqual(["Unknown"]);
    expect(ankiGateway.deletedDecks).toEqual([["Empty"]]);
  });
});
