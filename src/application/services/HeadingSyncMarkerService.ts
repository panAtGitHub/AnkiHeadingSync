import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";

export interface HeadingSyncMarker {
  noteId: number;
  raw: string;
  lineIndex: number;
}

export class HeadingSyncMarkerService {
  apply(location: SourceLocation, noteId: number): string {
    if (!location.sourceContent) {
      throw new Error(`Missing scanned source content for ${location.filePath}.`);
    }

    const lineEnding = location.sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = location.sourceContent.split(/\r?\n/);
    const nextLines = [...lines];
    const adjustedBlockEndLine = location.markerLine ? location.blockEndLine - 1 : location.blockEndLine;

    if (location.contentEndLine < location.headingLine || location.contentEndLine > adjustedBlockEndLine) {
      throw new Error(`Cannot write AHS marker outside the heading block in ${location.filePath}.`);
    }

    if (location.markerLine) {
      nextLines.splice(location.markerLine - 1, 1);
    }

    nextLines.splice(location.contentEndLine, 0, this.create(noteId).raw);
    return nextLines.join(lineEnding);
  }

  create(noteId: number): HeadingSyncMarker {
    return {
      noteId,
      raw: `<!-- AHS:${noteId} -->`,
      lineIndex: -1,
    };
  }
}