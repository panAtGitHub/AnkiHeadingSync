import type { AnkiGateway } from "@/application/ports/AnkiGateway";

import type { CleanupEmptyDecksResult } from "./cleanupResetTypes";

export class CleanupEmptyDecksUseCase {
  constructor(private readonly ankiGateway: AnkiGateway) {}

  async listCandidates(): Promise<string[]> {
    const deckNames = await this.ankiGateway.listDeckNames();
    const stats = await this.ankiGateway.getDeckStats(deckNames);
    const counts = new Map(stats.map((stat) => [stat.deckName, stat.noteCount]));

    return stats
      .filter((stat) => deckNames.filter((name) => isInDeckTree(name, stat.deckName)).every((name) => counts.get(name) === 0))
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

    const candidateSet = new Set(candidateDeckNames);
    const skippedDeckNames: string[] = [];
    const deletedDeckNames: string[] = [];

    // Delete children first. A remaining child (unselected, new, or failed) blocks
    // its parent, because Anki's deleteDecks also deletes descendants.
    const orderedNames = [...uniqueSelectedDeckNames].sort((left, right) => right.split("::").length - left.split("::").length);
    for (const deckName of orderedNames) {
      try {
        const currentNames = await this.ankiGateway.listDeckNames();
        const treeNames = currentNames.filter((name) => isInDeckTree(name, deckName));
        if (!candidateSet.has(deckName) || !currentNames.includes(deckName)
          || treeNames.some((name) => name !== deckName)) {
          skippedDeckNames.push(deckName);
          continue;
        }
        const stats = await this.ankiGateway.getDeckStats(treeNames);
        if (stats.find((stat) => stat.deckName === deckName)?.noteCount !== 0) {
          skippedDeckNames.push(deckName);
          continue;
        }
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

function isInDeckTree(name: string, root: string): boolean {
  return name === root || name.startsWith(`${root}::`);
}
