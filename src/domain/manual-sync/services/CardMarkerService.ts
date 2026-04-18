import { hashString } from "@/domain/shared/hash";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { AhsMarker } from "@/domain/manual-sync/entities/AhsMarker";

export interface MarkerWriteRequest {
  filePath: string;
  cardId: string;
  noteId?: number;
  blockStartLine: number;
  contentEndLine: number;
  blockEndLine: number;
  markerLine?: number;
  sourceContent: string;
}

export class CardMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardMarkerError";
  }
}

const AHS_MARKER_CANDIDATE_REGEXP = /<!--\s*AHS:/;
const AHS_MARKER_REGEXP = /^\s*<!--\s*AHS:card=([A-Za-z0-9_-]+)(?:\s+note=([1-9]\d*))?\s*-->\s*$/;

export class CardMarkerService {
  private counter = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  isCandidate(line: string): boolean {
    return AHS_MARKER_CANDIDATE_REGEXP.test(line);
  }

  parse(line: string, lineIndex: number): AhsMarker | null {
    const match = line.match(AHS_MARKER_REGEXP);
    if (!match) {
      return null;
    }

    return {
      cardId: match[1],
      noteId: match[2] ? Number(match[2]) : undefined,
      raw: match[0].trim(),
      lineIndex,
    };
  }

  create(cardId: string, noteId?: number): AhsMarker {
    return {
      cardId,
      noteId,
      raw: noteId ? `<!-- AHS:card=${cardId} note=${noteId} -->` : `<!-- AHS:card=${cardId} -->`,
      lineIndex: -1,
    };
  }

  createForCard(card: IndexedCard): AhsMarker {
    return this.create(card.cardId, card.noteId);
  }

  generateCardId(): string {
    this.counter += 1;
    return `ahs_${hashString(`${this.now()}|${this.counter}|${Math.random()}`).slice(0, 12)}`;
  }

  applyBatch(sourceContent: string, writes: MarkerWriteRequest[]): string {
    if (writes.length === 0) {
      return sourceContent;
    }

    const filePath = writes[0]?.filePath;
    const seenBlocks = new Set<number>();
    const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = sourceContent.split(/\r?\n/);

    for (const write of writes) {
      if (write.filePath !== filePath) {
        throw new CardMarkerError("Batch marker writes must belong to the same Markdown file.");
      }

      if (write.sourceContent !== sourceContent) {
        throw new CardMarkerError(`Marker writes for ${write.filePath} must share the scanned source content.`);
      }

      if (write.markerLine === undefined && write.contentEndLine > write.blockEndLine) {
        throw new CardMarkerError(`Cannot insert marker outside the heading block in ${write.filePath}.`);
      }

      if (write.markerLine !== undefined && write.markerLine < write.blockStartLine) {
        throw new CardMarkerError(`Cannot replace marker outside the heading block in ${write.filePath}.`);
      }

      if (seenBlocks.has(write.blockStartLine)) {
        throw new CardMarkerError(`Duplicate marker write detected for block ${write.blockStartLine} in ${write.filePath}.`);
      }

      seenBlocks.add(write.blockStartLine);
    }

    const sortedWrites = [...writes].sort((left, right) => right.blockStartLine - left.blockStartLine);
    for (const write of sortedWrites) {
      const adjustedBlockEndLine = write.markerLine ? write.blockEndLine - 1 : write.blockEndLine;
      if (write.contentEndLine < write.blockStartLine || write.contentEndLine > adjustedBlockEndLine) {
        throw new CardMarkerError(`Cannot write marker outside the heading block in ${write.filePath}.`);
      }

      if (write.markerLine) {
        lines.splice(write.markerLine - 1, 1);
      }

      lines.splice(write.contentEndLine, 0, this.create(write.cardId, write.noteId).raw);
    }

    return lines.join(lineEnding);
  }
}