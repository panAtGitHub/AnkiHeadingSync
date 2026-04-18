import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";

export interface IndexedFile {
  filePath: string;
  fileHash: string;
  fileStamp: string;
  content?: string;
  cards: IndexedCard[];
}