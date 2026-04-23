import type { CardAnswerCutoffMode } from "@/application/config/PluginSettings";
import { hashString } from "@/domain/shared/hash";
import type { GroupItem, GroupMarkerState } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";

import { GroupMarkerService, type ParsedGroupMarker } from "./GroupMarkerService";
import { resolveAnswerBoundary } from "./AnswerBoundaryParser";

const LIST_ITEM_REGEXP = /^([ \t]*)(?:[-+*]|\d+[.)])\s+(.*)$/;

export interface QaGroupBlockParserInput {
  parentHeadingText: string;
  marker: string;
  bodyLines: string[];
  bodyStartLine: number;
  cardAnswerCutoffMode?: CardAnswerCutoffMode;
}

export interface ParsedQaGroupBlock {
  stem: string;
  items: GroupItem[];
  markerState: GroupMarkerState;
  groupMarker?: ParsedGroupMarker;
  contentEndLine: number;
  markerLine?: number;
  markerIndent?: string;
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
}

export class QaGroupBlockParser {
  constructor(private readonly groupMarkerService = new GroupMarkerService()) {}

  isQaGroupHeading(headingText: string, marker: string): boolean {
    return headingText.trimEnd().endsWith(marker);
  }

  parse(input: QaGroupBlockParserInput): ParsedQaGroupBlock {
    const stem = stripQaGroupMarker(input.parentHeadingText, input.marker);
    const boundary = resolveAnswerBoundary({
      lines: input.bodyLines,
      startLine: input.bodyStartLine,
      fallbackLine: input.bodyStartLine - 1,
      cutoffMode: input.cardAnswerCutoffMode ?? "heading-block",
      markerAdapter: this.groupMarkerService,
    });
    const rootItems = collectRootListItems(boundary.contentLines);
    const items: GroupItem[] = [];

    for (let index = 0; index < rootItems.length; index += 1) {
      const item = rootItems[index];
      const nextItem = rootItems[index + 1];
      const childRegion = collectChildRegion(
        boundary.contentLines,
        item.index + 1,
        nextItem?.index ?? boundary.contentLines.length,
        item.indent.length,
      );

      if (!childRegion) {
        continue;
      }

      const firstSecondLevelItem = findFirstSecondLevelItem(childRegion.rawLines, item.indent.length);
      if (!firstSecondLevelItem) {
        continue;
      }

      items.push({
        title: item.labelMarkdown,
        answer: firstSecondLevelItem.labelMarkdown,
        ordinalInMarkdown: index + 1,
      });
    }

    const normalizedBodyLines = trimBlankEdges(boundary.contentLines.filter((line) => !isLegacyCardMarkerLine(line)));
    const rawBlockText = [
      `qa-group:${stem}`,
      ...items.map((item) => `${item.title}\n${item.answer}`),
      ...normalizedBodyLines,
    ].join("\n").trimEnd();

    return {
      stem,
      items,
      markerState: boundary.markerState,
      groupMarker: boundary.marker,
      contentEndLine: boundary.contentEndLine,
      markerLine: boundary.markerLine,
      markerIndent: boundary.markerIndent,
      rawBlockText,
      rawBlockHash: hashString(rawBlockText),
    };
  }
}

function stripQaGroupMarker(headingText: string, marker: string): string {
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
  };
}

function findFirstSecondLevelItem(lines: string[], parentIndentLength: number): ListItemMatch | null {
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

    const indent = match[1];
    if (indent.length <= parentIndentLength) {
      continue;
    }

    candidates.push({
      index,
      indent,
      labelMarkdown: match[2].trimEnd(),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  const directIndentLength = Math.min(...candidates.map((candidate) => candidate.indent.length));
  return candidates.find((candidate) => candidate.indent.length === directIndentLength) ?? null;
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

function leadingWhitespace(line: string): string {
  const match = line.match(/^[ \t]*/);
  return match?.[0] ?? "";
}

function isFenceLine(trimmedLine: string): boolean {
  return trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~");
}

function isLegacyCardMarkerLine(line: string): boolean {
  return /^\s*<!--\s*ID:/i.test(line);
}