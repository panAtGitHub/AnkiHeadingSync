import type { CardKey } from "../../card/value-objects/CardKey";
import type { ContentHash } from "../../card/value-objects/ContentHash";
import type { SyncRecord } from "./SyncRecord";

export class SyncRegistry {
  private readonly recordsByCardKey = new Map<CardKey, SyncRecord>();
  private readonly cardKeysByNoteId = new Map<number, CardKey>();

  constructor(records: SyncRecord[] = []) {
    for (const record of records) {
      this.upsert(record);
    }
  }

  get(cardKey: CardKey): SyncRecord | undefined {
    return this.recordsByCardKey.get(cardKey);
  }

  findByNoteId(noteId: number): SyncRecord | undefined {
    const cardKey = this.cardKeysByNoteId.get(noteId);
    return cardKey ? this.recordsByCardKey.get(cardKey) : undefined;
  }

  list(): SyncRecord[] {
    return Array.from(this.recordsByCardKey.values());
  }

  recordSync(record: SyncRecord): void {
    this.upsert({
      ...record,
      orphan: false,
    });
  }

  refresh(cardKey: CardKey, filePath: string, sourceHash: ContentHash, lastSyncedAt: number): void {
    const existing = this.requireRecord(cardKey);

    this.upsert({
      ...existing,
      filePath,
      sourceHash,
      lastSyncedAt,
      orphan: false,
    });
  }

  markOrphan(cardKey: CardKey, lastSyncedAt: number): void {
    const existing = this.requireRecord(cardKey);

    this.upsert({
      ...existing,
      lastSyncedAt,
      orphan: true,
    });
  }

  upsert(record: SyncRecord): void {
    const existingForNoteId = this.cardKeysByNoteId.get(record.noteId);

    if (existingForNoteId && existingForNoteId !== record.cardKey) {
      this.recordsByCardKey.delete(existingForNoteId);
    }

    const previous = this.recordsByCardKey.get(record.cardKey);
    if (previous && previous.noteId !== record.noteId) {
      this.cardKeysByNoteId.delete(previous.noteId);
    }

    this.recordsByCardKey.set(record.cardKey, record);
    this.cardKeysByNoteId.set(record.noteId, record.cardKey);
  }

  private requireRecord(cardKey: CardKey): SyncRecord {
    const existing = this.recordsByCardKey.get(cardKey);

    if (!existing) {
      throw new Error(`Sync record not found for card key ${cardKey}.`);
    }

    return existing;
  }
}