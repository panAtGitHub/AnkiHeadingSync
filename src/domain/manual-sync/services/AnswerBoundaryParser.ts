import type { CardAnswerCutoffMode } from "@/application/config/PluginSettings";

export type MarkerBoundaryState = "missing" | "present-valid" | "present-invalid";

export interface BoundaryMarkerAdapter<TMarker> {
  isCandidate(line: string): boolean;
  parse(line: string, lineIndex: number): TMarker | null;
}

export interface ResolveAnswerBoundaryInput<TMarker> {
  lines: string[];
  startLine: number;
  fallbackLine: number;
  cutoffMode: CardAnswerCutoffMode;
  markerAdapter: BoundaryMarkerAdapter<TMarker>;
}

export interface AnswerBoundary<TMarker> {
  contentLines: string[];
  trailingLines: string[];
  contentEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  marker?: TMarker;
  markerState: MarkerBoundaryState;
}

interface MarkerCandidate<TMarker> {
  index: number;
  indent: string;
  marker?: TMarker;
  valid: boolean;
}

interface BlankRun {
  start: number;
  end: number;
}

export function resolveAnswerBoundary<TMarker>(input: ResolveAnswerBoundaryInput<TMarker>): AnswerBoundary<TMarker> {
  const candidates = collectMarkerCandidates(input.lines, input.startLine, input.markerAdapter);
  const validMarker = candidates.find((candidate) => candidate.valid);
  if (validMarker?.marker) {
    const contentLines = input.lines.slice(0, validMarker.index);
    return {
      contentLines,
      trailingLines: stripLeadingBlankLines(input.lines.slice(validMarker.index + 1)),
      contentEndLine: findContentEndLine(contentLines, input.startLine, input.fallbackLine),
      markerLine: input.startLine + validMarker.index,
      markerIndent: validMarker.indent,
      marker: validMarker.marker,
      markerState: "present-valid",
    };
  }

  const blankRun = input.cutoffMode === "double-blank-lines" ? findFirstDoubleBlankRun(input.lines) : undefined;
  if (blankRun) {
    const invalidTrailingMarker = candidates.find((candidate) => !candidate.valid && candidate.index >= blankRun.end);
    const contentLines = input.lines.slice(0, blankRun.start);
    return {
      contentLines,
      trailingLines: input.lines.slice(blankRun.end),
      contentEndLine: findContentEndLine(contentLines, input.startLine, input.fallbackLine),
      markerLine: invalidTrailingMarker ? input.startLine + invalidTrailingMarker.index : undefined,
      markerIndent: invalidTrailingMarker?.indent,
      markerState: invalidTrailingMarker ? "present-invalid" : "missing",
    };
  }

  const lastNonEmptyIndex = findLastNonEmptyLineIndex(input.lines);
  const trailingInvalidMarker = lastNonEmptyIndex === undefined
    ? undefined
    : candidates.find((candidate) => !candidate.valid && candidate.index === lastNonEmptyIndex);
  if (trailingInvalidMarker) {
    const contentLines = input.lines.filter((_line, index) => index !== trailingInvalidMarker.index);
    return {
      contentLines,
      trailingLines: [],
      contentEndLine: findContentEndLine(contentLines, input.startLine, input.fallbackLine),
      markerLine: input.startLine + trailingInvalidMarker.index,
      markerIndent: trailingInvalidMarker.indent,
      markerState: "present-invalid",
    };
  }

  return {
    contentLines: input.lines,
    trailingLines: [],
    contentEndLine: findContentEndLine(input.lines, input.startLine, input.fallbackLine),
    markerState: "missing",
  };
}

function collectMarkerCandidates<TMarker>(
  lines: string[],
  startLine: number,
  markerAdapter: BoundaryMarkerAdapter<TMarker>,
): MarkerCandidate<TMarker>[] {
  const candidates: MarkerCandidate<TMarker>[] = [];
  let fenceMarker: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (isFenceLine(trimmed)) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      continue;
    }

    if (fenceMarker || !markerAdapter.isCandidate(line)) {
      continue;
    }

    const marker = markerAdapter.parse(line, startLine + index);
    candidates.push({
      index,
      indent: leadingWhitespace(line),
      marker: marker ?? undefined,
      valid: Boolean(marker),
    });
  }

  return candidates;
}

function findFirstDoubleBlankRun(lines: string[]): BlankRun | undefined {
  let fenceMarker: string | null = null;
  let blankStart: number | undefined;
  let blankCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (isFenceLine(trimmed)) {
      if (blankCount >= 2 && blankStart !== undefined) {
        return { start: blankStart, end: index };
      }

      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      blankStart = undefined;
      blankCount = 0;
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    if (!trimmed) {
      blankStart ??= index;
      blankCount += 1;
      continue;
    }

    if (blankCount >= 2 && blankStart !== undefined) {
      return { start: blankStart, end: index };
    }

    blankStart = undefined;
    blankCount = 0;
  }

  if (blankCount >= 2 && blankStart !== undefined) {
    return { start: blankStart, end: lines.length };
  }

  return undefined;
}

function findContentEndLine(lines: string[], startLine: number, fallbackLine: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) {
      return startLine + index;
    }
  }

  return fallbackLine;
}

function findLastNonEmptyLineIndex(lines: string[]): number | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) {
      return index;
    }
  }

  return undefined;
}

function stripLeadingBlankLines(lines: string[]): string[] {
  let startIndex = 0;
  while (startIndex < lines.length && !lines[startIndex].trim()) {
    startIndex += 1;
  }

  return lines.slice(startIndex);
}

function leadingWhitespace(line: string): string {
  const match = line.match(/^[ \t]*/);
  return match?.[0] ?? "";
}

function isFenceLine(trimmedLine: string): boolean {
  return trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~");
}