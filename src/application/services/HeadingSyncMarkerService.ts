import type { ContentHash } from "@/domain/card/value-objects/ContentHash";
import type { CardKey } from "@/domain/card/value-objects/CardKey";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";

export interface HeadingSyncMarker {
  noteId: number;
  raw: string;
  lineIndex: number;
}

export interface MarkerWriteRequest {
  cardKey: CardKey;
  filePath: string;
  noteId: number;
  location: SourceLocation;
  mode: "insert" | "replace";
  sourceHash: ContentHash;
}

export class HeadingSyncMarkerBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeadingSyncMarkerBatchError";
  }
}

export class HeadingSyncMarkerService {
  apply(location: SourceLocation, noteId: number): string {
    if (!location.sourceContent) {
      throw new Error(`Missing scanned source content for ${location.filePath}.`);
    }

    return this.applyBatch(location.sourceContent, [
      {
        cardKey: "single-write" as CardKey,
        filePath: location.filePath,
        noteId,
        location,
        mode: location.markerLine ? "replace" : "insert",
        sourceHash: "single-write" as ContentHash,
      },
    ]);
  }

  applyBatch(sourceContent: string, writes: MarkerWriteRequest[]): string {
    if (writes.length === 0) {
      return sourceContent;
    }

    const filePath = writes[0]?.filePath;
    const seenBlocks = new Set<number>();

    for (const write of writes) {
      if (write.filePath !== filePath) {
        throw new HeadingSyncMarkerBatchError("Batch marker writes must belong to the same Markdown file.");
      }

      if (write.location.filePath !== write.filePath) {
        throw new HeadingSyncMarkerBatchError(`Marker write path mismatch for ${write.filePath}.`);
      }

      if (write.location.sourceContent !== sourceContent) {
        throw new HeadingSyncMarkerBatchError(`Marker writes for ${write.filePath} must share the scanned source content.`);
      }

      if (write.mode === "replace" && !write.location.markerLine) {
        throw new HeadingSyncMarkerBatchError(`Cannot replace a missing AHS marker in ${write.filePath}.`);
      }

      const blockKey = write.location.blockStartLine;
      if (seenBlocks.has(blockKey)) {
        throw new HeadingSyncMarkerBatchError(`Duplicate marker write detected for block ${blockKey} in ${write.filePath}.`);
      }

      seenBlocks.add(blockKey);
    }

    const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const nextLines = sourceContent.split(/\r?\n/);

    const sortedWrites = [...writes].sort((left, right) => right.location.blockStartLine - left.location.blockStartLine);
    for (const write of sortedWrites) {
      this.applyToLines(nextLines, write.location, write.noteId);
    }

    return nextLines.join(lineEnding);
  }

  applyToLines(lines: string[], location: SourceLocation, noteId: number): void {
    const adjustedBlockEndLine = location.markerLine ? location.blockEndLine - 1 : location.blockEndLine;

    if (location.contentEndLine < location.headingLine || location.contentEndLine > adjustedBlockEndLine) {
      throw new HeadingSyncMarkerBatchError(`Cannot write AHS marker outside the heading block in ${location.filePath}.`);
    }

    const removalIndexes = new Set<number>();
    if (location.markerLine) {
      removalIndexes.add(location.markerLine - 1);
    }

    for (let lineIndex = location.contentEndLine; lineIndex < location.blockEndLine; lineIndex += 1) {
      if (!(lines[lineIndex] ?? "").trim()) {
        removalIndexes.add(lineIndex);
      }
    }

    const sortedRemovals = [...removalIndexes].sort((left, right) => right - left);
    const insertionIndex = location.contentEndLine - [...removalIndexes].filter((lineIndex) => lineIndex < location.contentEndLine).length;

    for (const lineIndex of sortedRemovals) {
      lines.splice(lineIndex, 1);
    }

    lines.splice(insertionIndex, 0, this.create(noteId).raw);
    while (insertionIndex + 1 < lines.length && !(lines[insertionIndex + 1] ?? "").trim()) {
      lines.splice(insertionIndex + 1, 1);
    }

    if (insertionIndex + 1 < lines.length) {
      lines.splice(insertionIndex + 1, 0, "", "");
    }
  }

  create(noteId: number): HeadingSyncMarker {
    return {
      noteId,
      raw: `<!-- AHS:${noteId} -->`,
      lineIndex: -1,
    };
  }
}
