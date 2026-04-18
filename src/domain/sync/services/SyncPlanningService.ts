import type { Card } from "../../card/entities/Card";
import type { SyncRegistry } from "../entities/SyncRegistry";
import type { SyncPlan } from "../value-objects/SyncPlan";

export class SyncPlanningService {
  plan(cards: Card[], registry: SyncRegistry, scopedFilePaths: string[]): SyncPlan {
    const seenKeys = new Set<string>();
    const seenEmbeddedNoteIds = new Set<number>();
    const createDecks = new Map<string, Card["deck"]>();
    const toAdd: Card[] = [];
    const toUpdate: SyncPlan["toUpdate"] = [];

    for (const card of cards) {
      if (seenKeys.has(card.key)) {
        throw new Error(`Duplicate card key detected in current scan: ${card.key}`);
      }

      seenKeys.add(card.key);

      if (card.embeddedNoteId) {
        if (seenEmbeddedNoteIds.has(card.embeddedNoteId)) {
          throw new Error(`Duplicate embedded note id detected in current scan: ${card.embeddedNoteId}`);
        }

        seenEmbeddedNoteIds.add(card.embeddedNoteId);
      }

      const existingRecord = registry.get(card.key);

      if (existingRecord?.identityMode === "pending-note-id-write") {
        toUpdate.push({ card, noteId: existingRecord.noteId });
        createDecks.set(card.deck, card.deck);
        continue;
      }

      if (card.embeddedNoteId) {
        const existingEmbeddedRecord = registry.findByNoteId(card.embeddedNoteId);

        if (!existingEmbeddedRecord) {
          toUpdate.push({ card, noteId: card.embeddedNoteId });
          createDecks.set(card.deck, card.deck);
          continue;
        }

        if (existingEmbeddedRecord.sourceHash !== card.contentHash || existingEmbeddedRecord.orphan) {
          toUpdate.push({ card, noteId: card.embeddedNoteId });
          createDecks.set(card.deck, card.deck);
        }

        continue;
      }

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
    const toMarkOrphan = registry.list().filter((record) => {
      if (!scopedPaths.has(record.filePath) || record.orphan) {
        return false;
      }

      if (record.identityMode === "embedded-note-id") {
        return !seenEmbeddedNoteIds.has(record.noteId);
      }

      return !seenKeys.has(record.cardKey);
    });

    return {
      toCreateDecks: Array.from(createDecks.values()),
      toAdd,
      toUpdate,
      toMarkOrphan,
    };
  }
}