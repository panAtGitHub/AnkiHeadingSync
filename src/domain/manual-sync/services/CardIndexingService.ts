import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import type { CardState, PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { CardMarkerError, CardMarkerService } from "./CardMarkerService";
import { DeckExtractionService } from "./DeckExtractionService";

interface HeadingMatch {
  level: number;
  text: string;
  lineIndex: number;
}

interface MarkerExtractionResult {
  bodyLines: string[];
  markerCardId?: string;
  markerNoteId?: number;
  contentEndLine: number;
  markerLine?: number;
  markerState: IndexedCard["markerState"];
}

export interface CardIndexingContext {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  fileStamp: string;
  knownCards: CardState[];
  pendingWriteBack: PendingWriteBackState[];
  fileDeckEnabled?: boolean;
  fileDeckMarker?: string;
}

const HEADING_REGEXP = /^(#{1,6})\s+(.*?)\s*$/;
export class CardIndexingService {
  constructor(
    private readonly markerService = new CardMarkerService(),
    private readonly deckExtractionService = new DeckExtractionService(),
  ) {}

  index(sourceFile: SourceFile, context: CardIndexingContext): IndexedFile {
    validateHeadingPolicy(context.qaHeadingLevel, context.clozeHeadingLevel);

    const lines = sourceFile.content.split(/\r?\n/);
    const lineStartOffsets = computeLineStartOffsets(sourceFile.content);
    const headings = collectHeadings(lines);
    const extractedDeck = context.fileDeckEnabled
      ? this.deckExtractionService.extract(sourceFile, context.fileDeckMarker ?? "TARGET DECK")
      : { warnings: [] };
    const cards: IndexedCard[] = [];
    const knownCardsById = new Map(context.knownCards.map((card) => [card.cardId, card]));
    const knownCardsByBlockKey = groupKnownCardsByBlockKey(context.knownCards);
    const pendingByCardId = new Map(context.pendingWriteBack.map((pending) => [pending.cardId, pending]));
    const usedCardIds = new Set<string>();

    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
      const heading = headings[headingIndex];
      const cardType = resolveCardType(heading.level, context.qaHeadingLevel, context.clozeHeadingLevel);
      if (!cardType) {
        continue;
      }

      const blockEndLineIndex = findBlockEndLineIndex(headings, headingIndex, lines.length);
      const bodyLines = lines.slice(heading.lineIndex + 1, blockEndLineIndex);
      const marker = extractMarker(bodyLines, heading.lineIndex + 2, heading.lineIndex + 1, this.markerService);
      const trimmedBodyLines = trimBlankEdges(marker.bodyLines);
      const bodyMarkdown = trimmedBodyLines.join("\n");
      const rawBlockText = [lines[heading.lineIndex], ...trimmedBodyLines].join("\n").trimEnd();
      const rawBlockHash = hashString(rawBlockText);
      const resolvedIdentity = this.resolveIdentity(
        sourceFile.path,
        rawBlockHash,
        marker.markerCardId,
        marker.markerNoteId,
        knownCardsById,
        knownCardsByBlockKey,
        pendingByCardId,
        usedCardIds,
      );

      usedCardIds.add(resolvedIdentity.cardId);

      cards.push({
        cardId: resolvedIdentity.cardId,
        noteId: resolvedIdentity.noteId,
        markerNoteId: marker.markerNoteId,
        filePath: sourceFile.path,
        cardType,
        heading: heading.text,
        headingLevel: heading.level,
        bodyMarkdown,
        blockStartOffset: lineStartOffsets[heading.lineIndex] ?? 0,
        blockEndOffset: blockEndLineIndex < lines.length ? (lineStartOffsets[blockEndLineIndex] ?? sourceFile.content.length) : sourceFile.content.length,
        blockStartLine: heading.lineIndex + 1,
        bodyStartLine: heading.lineIndex + 2,
        blockEndLine: blockEndLineIndex,
        contentEndLine: marker.contentEndLine,
        markerLine: marker.markerLine,
        rawBlockText,
        rawBlockHash,
        deckHint: extractedDeck.explicitDeckHint,
        deckHintSource: extractedDeck.explicitDeckSource,
        deckWarnings: [...extractedDeck.warnings],
        tagsHint: [],
        markerState: marker.markerState,
        sourceContent: sourceFile.content,
      });
    }

    return {
      filePath: sourceFile.path,
      fileHash: hashString(sourceFile.content),
      fileStamp: context.fileStamp,
      content: sourceFile.content,
      cards,
    };
  }

  private resolveIdentity(
    filePath: string,
    rawBlockHash: string,
    markerCardId: string | undefined,
    markerNoteId: number | undefined,
    knownCardsById: Map<string, CardState>,
    knownCardsByBlockKey: Map<string, CardState[]>,
    pendingByCardId: Map<string, PendingWriteBackState>,
    usedCardIds: Set<string>,
  ): { cardId: string; noteId?: number } {
    if (markerCardId) {
      const pending = pendingByCardId.get(markerCardId);
      const known = knownCardsById.get(markerCardId);

      return {
        cardId: markerCardId,
        noteId: pending?.noteId ?? known?.noteId ?? markerNoteId,
      };
    }

    const knownMatches = knownCardsByBlockKey.get(createKnownCardBlockKey(filePath, rawBlockHash)) ?? [];
    if (knownMatches.length === 1 && !usedCardIds.has(knownMatches[0].cardId)) {
      return {
        cardId: knownMatches[0].cardId,
        noteId: knownMatches[0].noteId,
      };
    }

    return {
      cardId: this.markerService.generateCardId(),
    };
  }
}

function groupKnownCardsByBlockKey(knownCards: CardState[]): Map<string, CardState[]> {
  const grouped = new Map<string, CardState[]>();

  for (const card of knownCards) {
    if (card.orphan) {
      continue;
    }

    const key = createKnownCardBlockKey(card.filePath, card.rawBlockHash);
    const entries = grouped.get(key);
    if (entries) {
      entries.push(card);
      continue;
    }

    grouped.set(key, [card]);
  }

  return grouped;
}

function createKnownCardBlockKey(filePath: string, rawBlockHash: string): string {
  return `${filePath}\u0000${rawBlockHash}`;
}

function validateHeadingPolicy(qaHeadingLevel: number, clozeHeadingLevel: number): void {
  if (!Number.isInteger(qaHeadingLevel) || qaHeadingLevel < 1 || qaHeadingLevel > 6) {
    throw new Error("QA heading level must be an integer between 1 and 6.");
  }

  if (!Number.isInteger(clozeHeadingLevel) || clozeHeadingLevel < 1 || clozeHeadingLevel > 6) {
    throw new Error("Cloze heading level must be an integer between 1 and 6.");
  }

  if (qaHeadingLevel === clozeHeadingLevel) {
    throw new Error("QA and Cloze heading levels must be different.");
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

function resolveCardType(level: number, qaHeadingLevel: number, clozeHeadingLevel: number): IndexedCard["cardType"] | null {
  if (level === qaHeadingLevel) {
    return "basic";
  }

  if (level === clozeHeadingLevel) {
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

function extractMarker(
  bodyLines: string[],
  bodyStartLine: number,
  headingLine: number,
  markerService: CardMarkerService,
): MarkerExtractionResult {
  const candidates = bodyLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => markerService.isCandidate(line));
  const validMarkers = candidates
    .map(({ line, index }) => markerService.parse(line, bodyStartLine + index))
    .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker));

  if (validMarkers.length > 1) {
    throw new CardMarkerError(`Multiple AHS markers found in heading block at line ${headingLine}.`);
  }

  let lastNonEmptyIndex = bodyLines.length - 1;
  while (lastNonEmptyIndex >= 0 && !bodyLines[lastNonEmptyIndex].trim()) {
    lastNonEmptyIndex -= 1;
  }

  if (lastNonEmptyIndex < 0) {
    if (candidates.length > 0) {
      throw new CardMarkerError(`Invalid AHS marker found in heading block at line ${headingLine}.`);
    }

    return {
      bodyLines,
      contentEndLine: headingLine,
      markerState: "missing",
    };
  }

  const lastLine = bodyLines[lastNonEmptyIndex];
  const lastMarker = markerService.parse(lastLine, bodyStartLine + lastNonEmptyIndex);

  if (lastMarker) {
    for (const candidate of candidates) {
      if (candidate.index !== lastNonEmptyIndex) {
        throw new CardMarkerError(`Multiple or misplaced AHS markers found in heading block at line ${headingLine}.`);
      }
    }

    const nextBodyLines = bodyLines.filter((_line, index) => index !== lastNonEmptyIndex);
    return {
      bodyLines: nextBodyLines,
      markerCardId: lastMarker.cardId,
      markerNoteId: lastMarker.noteId,
      contentEndLine: findContentEndLine(nextBodyLines, bodyStartLine, headingLine),
      markerLine: bodyStartLine + lastNonEmptyIndex,
      markerState: lastMarker.noteId ? "card-and-note" : "card-only",
    };
  }

  if (candidates.length > 0) {
    throw new CardMarkerError(`Invalid AHS marker found in heading block at line ${headingLine}.`);
  }

  return {
    bodyLines,
    contentEndLine: findContentEndLine(bodyLines, bodyStartLine, headingLine),
    markerState: "missing",
  };
}

function findContentEndLine(bodyLines: string[], bodyStartLine: number, headingLine: number): number {
  for (let index = bodyLines.length - 1; index >= 0; index -= 1) {
    if (bodyLines[index].trim()) {
      return bodyStartLine + index;
    }
  }

  return headingLine;
}

function computeLineStartOffsets(content: string): number[] {
  const offsets = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}