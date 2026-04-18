import type { AnkiGateway } from "@/application/ports/AnkiGateway";

import type { CleanupEmptyDecksResult } from "./cleanupResetTypes";

export class CleanupEmptyDecksUseCase {
  constructor(private readonly ankiGateway: AnkiGateway) {}

  async listCandidates(): Promise<string[]> {
    const deckNames = await this.ankiGateway.listDeckNames();
    const leafDeckNames = collectLeafDeckNames(deckNames);
    const stats = await this.ankiGateway.getDeckStats(leafDeckNames);

    return stats
      .filter((stat) => stat.noteCount === 0)
      .map((stat) => stat.deckName)
      .sort((left, right) => left.localeCompare(right));
  }

  async execute(selectedDeckNames: string[], candidateDeckNames: string[]): Promise<CleanupEmptyDecksResult> {
    const uniqueSelectedDeckNames = Array.from(new Set(selectedDeckNames));
    if (uniqueSelectedDeckNames.length === 0) {
      return {
        candidateCount: candidateDeckNames.length,
        selectedCount: 0,
        deletedCount: 0,
        deletedDeckNames: [],
        skippedDeckNames: [],
      };
    }

    const [currentDeckNames, currentDeckStats] = await Promise.all([
      this.ankiGateway.listDeckNames(),
      this.ankiGateway.getDeckStats(uniqueSelectedDeckNames),
    ]);

    const currentLeafDeckNameSet = new Set(collectLeafDeckNames(currentDeckNames));
    const currentDeckStatsByName = new Map(currentDeckStats.map((stat) => [stat.deckName, stat.noteCount]));
    const deletableDeckNames = uniqueSelectedDeckNames.filter((deckName) => currentLeafDeckNameSet.has(deckName) && currentDeckStatsByName.get(deckName) === 0);
    const skippedDeckNames = uniqueSelectedDeckNames.filter((deckName) => !currentLeafDeckNameSet.has(deckName) || currentDeckStatsByName.get(deckName) !== 0);
    const deletedDeckNames: string[] = [];

    for (const deckName of deletableDeckNames) {
      try {
        await this.ankiGateway.deleteDecks([deckName]);
        deletedDeckNames.push(deckName);
      } catch {
        skippedDeckNames.push(deckName);
      }
    }

    return {
      candidateCount: candidateDeckNames.length,
      selectedCount: uniqueSelectedDeckNames.length,
      deletedCount: deletedDeckNames.length,
      deletedDeckNames,
      skippedDeckNames,
    };
  }
}

function collectLeafDeckNames(deckNames: string[]): string[] {
  return deckNames.filter((deckName) => !deckNames.some((candidate) => candidate !== deckName && candidate.startsWith(`${deckName}::`)));
}