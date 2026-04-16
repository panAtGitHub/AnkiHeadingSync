import type { Card } from "../../card/entities/Card";
import type { SyncRegistry } from "../entities/SyncRegistry";
import type { SyncPlan } from "../value-objects/SyncPlan";

export class SyncPlanningService {
  plan(cards: Card[], registry: SyncRegistry, scopedFilePaths: string[]): SyncPlan {
    const seenKeys = new Set<string>();
    const createDecks = new Map<string, Card["deck"]>();
    const toAdd: Card[] = [];
    const toUpdate: SyncPlan["toUpdate"] = [];

    for (const card of cards) {
      if (seenKeys.has(card.key)) {
        throw new Error(`Duplicate card key detected in current scan: ${card.key}`);
      }

      seenKeys.add(card.key);
      const existingRecord = registry.get(card.key);

      if (!existingRecord) {
        toAdd.push(card);
        createDecks.set(card.deck, card.deck);
        continue;
      }

      if (existingRecord.sourceHash !== card.contentHash || existingRecord.orphan) {
        toUpdate.push({ card, noteId: existingRecord.noteId });
        createDecks.set(card.deck, card.deck);
      }
    }

    const scopedPaths = new Set(scopedFilePaths);
    const toMarkOrphan = registry.list().filter((record) => scopedPaths.has(record.filePath) && !record.orphan && !seenKeys.has(record.cardKey));

    return {
      toCreateDecks: Array.from(createDecks.values()),
      toAdd,
      toUpdate,
      toMarkOrphan,
    };
  }
}