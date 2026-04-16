import type { SourceFile } from "../entities/SourceFile";
import type { CardDraft } from "../entities/CardDraft";
import { createDeckName } from "../value-objects/DeckName";

export interface HeadingPolicy {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
}

interface HeadingMatch {
  level: number;
  text: string;
  lineIndex: number;
}

const HEADING_REGEXP = /^(#{1,6})\s+(.*?)\s*$/;
const TARGET_DECK_REGEXP = /^\s*TARGET DECK\s*:\s*(.+?)\s*$/i;

export class CardExtractionService {
  extract(sourceFile: SourceFile, headingPolicy: HeadingPolicy): CardDraft[] {
    validateHeadingPolicy(headingPolicy);

    const lines = sourceFile.content.split(/\r?\n/);
    const headings = collectHeadings(lines);
    const targetDeck = extractTargetDeck(lines);
    const drafts: CardDraft[] = [];

    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
      const heading = headings[headingIndex];
      const cardType = getCardTypeForHeading(heading.level, headingPolicy);

      if (!cardType) {
        continue;
      }

      const blockEndLineIndex = findBlockEndLineIndex(headings, headingIndex, lines.length);
      const bodyLines = lines.slice(heading.lineIndex + 1, blockEndLineIndex);
      const bodyMarkdown = trimBlankEdges(bodyLines).join("\n");

      drafts.push({
        source: {
          filePath: sourceFile.path,
          headingLine: heading.lineIndex + 1,
          blockStartLine: heading.lineIndex + 1,
          bodyStartLine: heading.lineIndex + 2,
          blockEndLine: blockEndLineIndex,
          headingLevel: heading.level,
          headingText: heading.text,
        },
        heading: heading.text,
        headingLevel: heading.level,
        type: cardType,
        bodyMarkdown,
        deckHint: targetDeck ? createDeckName(targetDeck) : undefined,
      });
    }

    return drafts;
  }
}

export function validateHeadingPolicy(headingPolicy: HeadingPolicy): void {
  const { qaHeadingLevel, clozeHeadingLevel } = headingPolicy;

  if (!Number.isInteger(qaHeadingLevel) || qaHeadingLevel < 1 || qaHeadingLevel > 6) {
    throw new Error("QA heading level must be an integer between 1 and 6.");
  }

  if (!Number.isInteger(clozeHeadingLevel) || clozeHeadingLevel < 1 || clozeHeadingLevel > 6) {
    throw new Error("Cloze heading level must be an integer between 1 and 6.");
  }

  if (qaHeadingLevel === clozeHeadingLevel) {
    throw new Error("QA and Cloze heading levels must not be equal.");
  }
}

function collectHeadings(lines: string[]): HeadingMatch[] {
  const headings: HeadingMatch[] = [];
  let fenceMarker: string | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    const match = line.match(HEADING_REGEXP);
    if (!match) {
      continue;
    }

    headings.push({
      level: match[1].length,
      text: match[2].replace(/\s+#+\s*$/, "").trim(),
      lineIndex,
    });
  }

  return headings;
}

function extractTargetDeck(lines: string[]): string | undefined {
  let fenceMarker: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    const match = line.match(TARGET_DECK_REGEXP);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

function getCardTypeForHeading(level: number, headingPolicy: HeadingPolicy): "basic" | "cloze" | null {
  if (level === headingPolicy.qaHeadingLevel) {
    return "basic";
  }

  if (level === headingPolicy.clozeHeadingLevel) {
    return "cloze";
  }

  return null;
}

function findBlockEndLineIndex(headings: HeadingMatch[], currentHeadingIndex: number, totalLineCount: number): number {
  const currentHeading = headings[currentHeadingIndex];

  for (let headingIndex = currentHeadingIndex + 1; headingIndex < headings.length; headingIndex += 1) {
    const nextHeading = headings[headingIndex];
    if (nextHeading.level <= currentHeading.level) {
      return nextHeading.lineIndex;
    }
  }

  return totalLineCount;
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