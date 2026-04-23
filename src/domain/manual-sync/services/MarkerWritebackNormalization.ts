export interface NormalizedMarkerWriteInput {
  contentEndLine: number;
  blockEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  renderedMarker: string;
  additionalRemovalLineIndexes?: number[];
}

export function applyNormalizedMarkerWrite(lines: string[], input: NormalizedMarkerWriteInput): void {
  const removalIndexes = new Set<number>(input.additionalRemovalLineIndexes ?? []);
  if (input.markerLine !== undefined) {
    removalIndexes.add(input.markerLine - 1);
  }

  for (let lineIndex = input.contentEndLine; lineIndex < input.blockEndLine; lineIndex += 1) {
    if (!(lines[lineIndex] ?? "").trim()) {
      removalIndexes.add(lineIndex);
    }
  }

  const sortedRemovals = [...removalIndexes].sort((left, right) => right - left);
  const insertionIndex = input.contentEndLine - [...removalIndexes].filter((lineIndex) => lineIndex < input.contentEndLine).length;

  for (const lineIndex of sortedRemovals) {
    lines.splice(lineIndex, 1);
  }

  lines.splice(insertionIndex, 0, `${input.markerIndent ?? ""}${input.renderedMarker}`);
  while (insertionIndex + 1 < lines.length && !(lines[insertionIndex + 1] ?? "").trim()) {
    lines.splice(insertionIndex + 1, 1);
  }

  if (insertionIndex + 1 < lines.length) {
    lines.splice(insertionIndex + 1, 0, "", "");
  }
}