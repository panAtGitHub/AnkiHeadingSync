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