import { describe, expect, it } from "vitest";

import { FakeManualSyncAnkiGateway } from "@/test-support/manualSyncFakes";

import { CleanupEmptyDecksUseCase } from "./CleanupEmptyDecksUseCase";

describe("CleanupEmptyDecksUseCase", () => {
  it("detects empty decks from Anki stats", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    ankiGateway.deckStatsByName.set("Busy", { deckName: "Busy", noteCount: 2 });
    ankiGateway.deckStatsByName.set("Empty", { deckName: "Empty", noteCount: 0 });
    ankiGateway.deckStatsByName.set("Another::Empty", { deckName: "Another::Empty", noteCount: 0 });
    const useCase = new CleanupEmptyDecksUseCase(ankiGateway);

    const candidates = await useCase.listCandidates();

    expect(candidates).toEqual(["Another::Empty", "Empty"]);
  });

  it("deletes only the user-selected empty decks", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
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
});