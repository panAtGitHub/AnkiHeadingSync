import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { IdMarker } from "@/domain/manual-sync/entities/IdMarker";

export interface MarkerWriteRequest {
  filePath: string;
  noteId: number;
  blockStartLine: number;
  contentEndLine: number;
  blockEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  sourceContent: string;
}

export class CardMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardMarkerError";
  }
}

const ID_MARKER_CANDIDATE_REGEXP = /<!--\s*ID:/;
const ID_MARKER_REGEXP = /^\s*<!--\s*ID:\s*([1-9]\d*)\s*-->\s*$/;

export class CardMarkerService {
  isCandidate(line: string): boolean {
    return ID_MARKER_CANDIDATE_REGEXP.test(line);
  }

  parse(line: string, lineIndex: number): IdMarker | null {
    const match = line.match(ID_MARKER_REGEXP);
    if (!match) {
      return null;
    }

    return {
      noteId: Number(match[1]),
      raw: match[0].trim(),
      lineIndex,
    };
  }

  create(noteId: number): IdMarker {
    return {
      noteId,
      raw: `<!--ID: ${noteId}-->`,
      lineIndex: -1,
    };
  }

  createForCard(card: IndexedCard): IdMarker {
    if (card.noteId === undefined) {
      throw new CardMarkerError("Cannot create an ID marker without a noteId.");
    }

    return this.create(card.noteId);
  }

  applyBatch(sourceContent: string, writes: MarkerWriteRequest[]): string {
    if (writes.length === 0) {
      return sourceContent;
    }

    this.validateBatch(sourceContent, writes);
    const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = sourceContent.split(/\r?\n/);

    const sortedWrites = [...writes].sort((left, right) => right.blockStartLine - left.blockStartLine);
    for (const write of sortedWrites) {
      this.applyWrite(lines, write);
    }

    return lines.join(lineEnding);
  }

  validateBatch(sourceContent: string, writes: MarkerWriteRequest[]): void {
    const filePath = writes[0]?.filePath;
    const seenBlocks = new Set<number>();

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

      if (write.contentEndLine < write.blockStartLine || write.contentEndLine > write.blockEndLine) {
        throw new CardMarkerError(`Cannot write marker outside the content range in ${write.filePath}.`);
      }

      if (seenBlocks.has(write.blockStartLine)) {
        throw new CardMarkerError(`Duplicate marker write detected for block ${write.blockStartLine} in ${write.filePath}.`);
      }

      seenBlocks.add(write.blockStartLine);
    }
  }

  applyWrite(lines: string[], write: MarkerWriteRequest): void {
    const adjustedBlockEndLine = write.markerLine !== undefined ? write.blockEndLine - 1 : write.blockEndLine;
    if (write.contentEndLine < write.blockStartLine || write.contentEndLine > adjustedBlockEndLine) {
      throw new CardMarkerError(`Cannot write marker outside the heading block in ${write.filePath}.`);
    }

    const removalIndexes = new Set<number>();
    if (write.markerLine !== undefined) {
      removalIndexes.add(write.markerLine - 1);
    }

    for (let lineIndex = write.contentEndLine; lineIndex < write.blockEndLine; lineIndex += 1) {
      if (!(lines[lineIndex] ?? "").trim()) {
        removalIndexes.add(lineIndex);
      }
    }

    const sortedRemovals = [...removalIndexes].sort((left, right) => right - left);
    const insertionIndex = write.contentEndLine - [...removalIndexes].filter((lineIndex) => lineIndex < write.contentEndLine).length;

    for (const lineIndex of sortedRemovals) {
      lines.splice(lineIndex, 1);
    }

    lines.splice(insertionIndex, 0, `${write.markerIndent ?? ""}${this.create(write.noteId).raw}`);
    while (insertionIndex + 1 < lines.length && !(lines[insertionIndex + 1] ?? "").trim()) {
      lines.splice(insertionIndex + 1, 1);
    }

    if (insertionIndex + 1 < lines.length) {
      lines.splice(insertionIndex + 1, 0, "", "");
    }
  }
}
