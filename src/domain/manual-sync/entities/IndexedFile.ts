import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";

export interface IndexedFile {
  filePath: string;
  fileHash: string;
  fileStamp: string;
  content?: string;
  cards: IndexedCard[];
  groupBlocks?: IndexedGroupCardBlock[];
}