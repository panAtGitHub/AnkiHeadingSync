import { describe, expect, it } from "vitest";

import { FakeManualSyncAnkiGateway } from "@/test-support/manualSyncFakes";

import { CleanupEmptyDecksUseCase } from "./CleanupEmptyDecksUseCase";

describe("CleanupEmptyDecksUseCase", () => {
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

  it("excludes parent decks and keeps only empty leaf decks", async () => {
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

  it("does not delete a parent deck even if its direct count is zero", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.listedDeckNames = [
      "Parent",
      "Parent::Empty",
    ];
    ankiGateway.deckStatsByName.set("Parent", { deckName: "Parent", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Parent::Empty", { deckName: "Parent::Empty", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();
    const result = await useCase.execute(["Parent", "Parent::Empty"], candidates);

    expect(candidates).toEqual(["Parent::Empty"]);
    expect(result.deletedDeckNames).toEqual(["Parent::Empty"]);
    expect(result.skippedDeckNames).toEqual(["Parent"]);
    expect(ankiGateway.deletedDecks).toEqual([["Parent::Empty"]]);
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