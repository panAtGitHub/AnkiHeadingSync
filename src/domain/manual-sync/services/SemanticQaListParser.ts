import type { IdMarkerState } from "@/domain/manual-sync/entities/IdMarker";
import type { CardAnswerCutoffMode } from "@/application/config/PluginSettings";
import { hashString } from "@/domain/shared/hash";

import { CardMarkerService } from "./CardMarkerService";
import { resolveAnswerBoundary } from "./AnswerBoundaryParser";

const LIST_ITEM_REGEXP = /^([ \t]*)(?:[-+*]|\d+[.)])\s+(.*)$/;

export interface SemanticQaListParserInput {
  parentHeadingText: string;
  marker: string;
  bodyLines: string[];
  bodyStartLine: number;
  cardAnswerCutoffMode?: CardAnswerCutoffMode;
}

export interface SemanticQaListCard {
  heading: string;
  backlinkHeadingText: string;
  bodyMarkdown: string;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  contentEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  markerNoteId?: number;
  idMarkerState: IdMarkerState;
  rawBlockText: string;
  rawBlockHash: string;
}

interface ListItemMatch {
  index: number;
  indent: string;
  labelMarkdown: string;
}

interface ChildRegion {
  rawLines: string[];
  startIndex: number;
  endIndex: number;
}

export class SemanticQaListParser {
  constructor(private readonly markerService = new CardMarkerService()) {}

  isSemanticQaHeading(headingText: string, marker: string): boolean {
    return headingText.trimEnd().endsWith(marker);
  }

  parse(input: SemanticQaListParserInput): SemanticQaListCard[] {
    const displayParentHeadingText = stripSemanticQaMarker(input.parentHeadingText, input.marker);
    const rootItems = collectRootListItems(input.bodyLines);
    if (rootItems.length === 0) {
      return [];
    }

    const occurrenceByLabel = new Map<string, number>();
    const cards: SemanticQaListCard[] = [];

    for (let index = 0; index < rootItems.length; index += 1) {
      const item = rootItems[index];
      const nextItem = rootItems[index + 1];
      const childRegion = collectChildRegion(
        input.bodyLines,
        item.index + 1,
        nextItem?.index ?? input.bodyLines.length,
        item.indent.length,
      );

      if (!childRegion) {
        continue;
      }

      const absoluteBodyStartLine = input.bodyStartLine + childRegion.startIndex;
      const boundary = resolveAnswerBoundary({
        lines: childRegion.rawLines,
        startLine: absoluteBodyStartLine,
        fallbackLine: input.bodyStartLine + item.index,
        cutoffMode: input.cardAnswerCutoffMode ?? "heading-block",
        markerAdapter: this.markerService,
      });
      const trimmedBodyLines = trimBlankEdges(boundary.contentLines);
      if (trimmedBodyLines.length === 0) {
        continue;
      }

      const bodyMarkdown = dedentLines(trimmedBodyLines).join("\n");
      const normalizedLabel = normalizeSemanticLabel(item.labelMarkdown);
      const occurrenceIndex = (occurrenceByLabel.get(normalizedLabel) ?? 0) + 1;
      occurrenceByLabel.set(normalizedLabel, occurrenceIndex);
      const childKey = `${normalizedLabel}::${occurrenceIndex}`;
      const heading = `${displayParentHeadingText}<br>${item.labelMarkdown}`;
      const rawBlockText = [
        `semantic-qa:${childKey}`,
        displayParentHeadingText,
        item.labelMarkdown,
        bodyMarkdown,
      ].join("\n").trimEnd();

      cards.push({
        heading,
        backlinkHeadingText: input.parentHeadingText,
        bodyMarkdown,
        blockStartLine: input.bodyStartLine + item.index,
        bodyStartLine: absoluteBodyStartLine,
        blockEndLine: input.bodyStartLine + childRegion.endIndex,
        contentEndLine: boundary.contentEndLine,
        markerLine: boundary.markerLine,
        markerIndent: boundary.markerIndent ?? deriveMarkerIndent(trimmedBodyLines, item.indent),
        markerNoteId: boundary.marker?.noteId,
        idMarkerState: boundary.markerState,
        rawBlockText,
        rawBlockHash: hashString(rawBlockText),
      });
    }

    return cards;
  }
}

function stripSemanticQaMarker(headingText: string, marker: string): string {
  const trimmedHeading = headingText.trimEnd();
  if (!trimmedHeading.endsWith(marker)) {
    return trimmedHeading;
  }

  return trimmedHeading.slice(0, trimmedHeading.length - marker.length).trimEnd();
}

function collectRootListItems(lines: string[]): ListItemMatch[] {
  const candidates: ListItemMatch[] = [];
  let fenceMarker: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (isFenceLine(trimmed)) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    const match = line.match(LIST_ITEM_REGEXP);
    if (!match) {
      continue;
    }

    candidates.push({
      index,
      indent: match[1],
      labelMarkdown: match[2].trimEnd(),
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  const rootIndentLength = Math.min(...candidates.map((candidate) => candidate.indent.length));
  return candidates.filter((candidate) => candidate.indent.length === rootIndentLength);
}

function collectChildRegion(
  lines: string[],
  startIndex: number,
  endIndexExclusive: number,
  parentIndentLength: number,
): ChildRegion | null {
  let childStartIndex: number | undefined;
  let childEndIndex = startIndex - 1;
  let fenceMarker: string | null = null;

  for (let index = startIndex; index < endIndexExclusive; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const indentLength = leadingWhitespace(line).length;
    const insideFence = Boolean(fenceMarker);

    if (childStartIndex === undefined) {
      if (!trimmed) {
        continue;
      }

      if (indentLength <= parentIndentLength) {
        return null;
      }

      childStartIndex = index;
    } else if (!insideFence && trimmed && indentLength <= parentIndentLength) {
      break;
    }

    childEndIndex = index;

    if (isFenceLine(trimmed)) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
    }
  }

  if (childStartIndex === undefined) {
    return null;
  }

  return {
    rawLines: lines.slice(childStartIndex, childEndIndex + 1),
    startIndex: childStartIndex,
    endIndex: childEndIndex,
  };
}

function trimBlankEdges(lines: string[]): string[] {
  let startIndex = 0;
  let endIndex = lines.length;

  while (startIndex < endIndex && !lines[startIndex].trim()) {
    startIndex += 1;
  }

  while (endIndex > startIndex && !lines[endIndex - 1].trim()) {
    endIndex -= 1;
  }

  return lines.slice(startIndex, endIndex);
}

function dedentLines(lines: string[]): string[] {
  const indentLengths = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => leadingWhitespace(line).length);

  const commonIndent = indentLengths.length > 0 ? Math.min(...indentLengths) : 0;
  return lines.map((line) => line.slice(Math.min(commonIndent, line.length)));
}

function deriveMarkerIndent(bodyLines: string[], itemIndent: string): string {
  const firstNonEmptyLine = bodyLines.find((line) => line.trim().length > 0);
  if (firstNonEmptyLine) {
    return leadingWhitespace(firstNonEmptyLine);
  }

  return `${itemIndent}  `;
}

function leadingWhitespace(line: string): string {
  const match = line.match(/^[ \t]*/);
  return match?.[0] ?? "";
}

function normalizeSemanticLabel(labelMarkdown: string): string {
  return labelMarkdown.trim().replace(/\s+/g, " ");
}

function isFenceLine(trimmedLine: string): boolean {
  return trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~");
}