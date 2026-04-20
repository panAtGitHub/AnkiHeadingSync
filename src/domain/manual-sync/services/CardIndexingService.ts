import type { SourceFile } from "@/domain/card/entities/SourceFile";
import { createIndexedCardSyncKey, type IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { buildGroupSrc, createIndexedGroupSyncKey, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import { createPendingWriteBackKey, type CardState, type GroupBlockState, type PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { CardMarkerService } from "./CardMarkerService";
import { DeckExtractionService } from "./DeckExtractionService";
import { QaGroupBlockParser } from "./QaGroupBlockParser";
import { SemanticQaListParser } from "./SemanticQaListParser";

interface HeadingMatch {
  level: number;
  text: string;
  lineIndex: number;
}

interface MarkerExtractionResult {
  bodyLines: string[];
  markerNoteId?: number;
  contentEndLine: number;
  markerLine?: number;
  idMarkerState: IndexedCard["idMarkerState"];
}

export interface CardIndexingContext {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  qaGroupMarker?: string;
  semanticQaMarker?: string;
  fileStamp: string;
  knownCards: CardState[];
  knownGroupBlocks?: GroupBlockState[];
  pendingWriteBack: PendingWriteBackState[];
  fileDeckEnabled?: boolean;
  fileDeckMarker?: string;
}

const HEADING_REGEXP = /^(#{1,6})\s+(.*?)\s*$/;
export class CardIndexingService {
  constructor(
    private readonly markerService = new CardMarkerService(),
    private readonly deckExtractionService = new DeckExtractionService(),
    private readonly qaGroupBlockParser = new QaGroupBlockParser(),
    private readonly semanticQaListParser = new SemanticQaListParser(),
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
    const groupBlocks: IndexedGroupCardBlock[] = [];
    const knownCardsByBlockKey = groupKnownCardsByBlockKey(context.knownCards);
    const pendingByBlockKey = groupPendingWriteBackByBlockKey(context.pendingWriteBack);
    const usedNoteIds = new Set<number>();
    const usedGroupIds = new Set<string>();
    const knownGroupBlocks = context.knownGroupBlocks ?? [];

    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
      const heading = headings[headingIndex];
      const cardType = resolveCardType(heading.level, context.qaHeadingLevel, context.clozeHeadingLevel);
      if (!cardType) {
        continue;
      }

      const blockEndLineIndex = findBlockEndLineIndex(headings, headingIndex, lines.length);
      const bodyLines = lines.slice(heading.lineIndex + 1, blockEndLineIndex);
      const qaGroupMarker = context.qaGroupMarker ?? "#anki-list";
      if (cardType === "basic" && this.qaGroupBlockParser.isQaGroupHeading(heading.text, qaGroupMarker)) {
        const parsedGroupBlock = this.qaGroupBlockParser.parse({
          parentHeadingText: heading.text,
          marker: qaGroupMarker,
          bodyLines,
          bodyStartLine: heading.lineIndex + 2,
        });
        const src = buildGroupSrc(sourceFile.path, heading.text);
        const resolvedGroupIdentity = this.resolveGroupIdentity(
          src,
          parsedGroupBlock.rawBlockHash,
          parsedGroupBlock.groupMarker?.noteId,
          knownGroupBlocks,
          usedNoteIds,
          usedGroupIds,
        );

        if (resolvedGroupIdentity.noteId !== undefined) {
          usedNoteIds.add(resolvedGroupIdentity.noteId);
        }

        if (resolvedGroupIdentity.groupId) {
          usedGroupIds.add(resolvedGroupIdentity.groupId);
        }

        groupBlocks.push({
          noteId: resolvedGroupIdentity.noteId,
          groupId: resolvedGroupIdentity.groupId,
          syncKey: createIndexedGroupSyncKey(sourceFile.path, heading.lineIndex + 1, parsedGroupBlock.rawBlockHash),
          markerState: parsedGroupBlock.markerState,
          identitySource: resolvedGroupIdentity.identitySource,
          filePath: sourceFile.path,
          headingText: heading.text,
          backlinkHeadingText: heading.text,
          headingLevel: heading.level,
          stem: parsedGroupBlock.stem,
          src,
          blockStartOffset: lineStartOffsets[heading.lineIndex] ?? 0,
          blockEndOffset: blockEndLineIndex < lines.length ? (lineStartOffsets[blockEndLineIndex] ?? sourceFile.content.length) : sourceFile.content.length,
          blockStartLine: heading.lineIndex + 1,
          bodyStartLine: heading.lineIndex + 2,
          blockEndLine: blockEndLineIndex,
          contentEndLine: parsedGroupBlock.contentEndLine,
          markerLine: parsedGroupBlock.markerLine,
          markerIndent: parsedGroupBlock.markerIndent,
          rawBlockText: parsedGroupBlock.rawBlockText,
          rawBlockHash: parsedGroupBlock.rawBlockHash,
          deckHint: extractedDeck.explicitDeckHint,
          deckHintSource: extractedDeck.explicitDeckSource,
          deckWarnings: [...extractedDeck.warnings],
          items: parsedGroupBlock.items,
          groupMarker: parsedGroupBlock.groupMarker,
          freeSlots: parsedGroupBlock.groupMarker?.freeSlots ?? resolvedGroupIdentity.freeSlots,
          sourceContent: sourceFile.content,
        });

        continue;
      }

      const semanticQaMarker = context.semanticQaMarker ?? "#anki-list-qa";
      if (cardType === "basic" && this.semanticQaListParser.isSemanticQaHeading(heading.text, semanticQaMarker)) {
        for (const semanticCard of this.semanticQaListParser.parse({
          parentHeadingText: heading.text,
          marker: semanticQaMarker,
          bodyLines,
          bodyStartLine: heading.lineIndex + 2,
        })) {
          const resolvedIdentity = this.resolveIdentity(
            sourceFile.path,
            semanticCard.blockStartLine,
            semanticCard.rawBlockHash,
            semanticCard.markerNoteId,
            knownCardsByBlockKey,
            pendingByBlockKey,
            usedNoteIds,
          );

          if (resolvedIdentity.noteId !== undefined) {
            usedNoteIds.add(resolvedIdentity.noteId);
          }

          cards.push({
            noteId: resolvedIdentity.noteId,
            syncKey: createIndexedCardSyncKey(sourceFile.path, semanticCard.blockStartLine, semanticCard.rawBlockHash),
            idMarkerState: semanticCard.idMarkerState,
            noteIdSource: resolvedIdentity.noteIdSource,
            filePath: sourceFile.path,
            cardType: "semantic-qa",
            heading: semanticCard.heading,
            backlinkHeadingText: semanticCard.backlinkHeadingText,
            headingLevel: heading.level,
            bodyMarkdown: semanticCard.bodyMarkdown,
            blockStartOffset: lineStartOffsets[semanticCard.blockStartLine - 1] ?? 0,
            blockEndOffset: semanticCard.blockEndLine < lines.length
              ? (lineStartOffsets[semanticCard.blockEndLine] ?? sourceFile.content.length)
              : sourceFile.content.length,
            blockStartLine: semanticCard.blockStartLine,
            bodyStartLine: semanticCard.bodyStartLine,
            blockEndLine: semanticCard.blockEndLine,
            contentEndLine: semanticCard.contentEndLine,
            markerLine: semanticCard.markerLine,
            markerIndent: semanticCard.markerIndent,
            rawBlockText: semanticCard.rawBlockText,
            rawBlockHash: semanticCard.rawBlockHash,
            deckHint: extractedDeck.explicitDeckHint,
            deckHintSource: extractedDeck.explicitDeckSource,
            deckWarnings: [...extractedDeck.warnings],
            tagsHint: [],
            sourceContent: sourceFile.content,
          });
        }

        continue;
      }

      const marker = extractMarker(bodyLines, heading.lineIndex + 2, heading.lineIndex + 1, this.markerService);
      const trimmedBodyLines = trimBlankEdges(marker.bodyLines);
      const bodyMarkdown = trimmedBodyLines.join("\n");
      const rawBlockText = [lines[heading.lineIndex], ...trimmedBodyLines].join("\n").trimEnd();
      const rawBlockHash = hashString(rawBlockText);
      const resolvedIdentity = this.resolveIdentity(
        sourceFile.path,
        heading.lineIndex + 1,
        rawBlockHash,
        marker.markerNoteId,
        knownCardsByBlockKey,
        pendingByBlockKey,
        usedNoteIds,
      );

      if (resolvedIdentity.noteId !== undefined) {
        usedNoteIds.add(resolvedIdentity.noteId);
      }

      cards.push({
        noteId: resolvedIdentity.noteId,
        syncKey: createIndexedCardSyncKey(sourceFile.path, heading.lineIndex + 1, rawBlockHash),
        idMarkerState: marker.idMarkerState,
        noteIdSource: resolvedIdentity.noteIdSource,
        filePath: sourceFile.path,
        cardType,
        heading: heading.text,
        backlinkHeadingText: heading.text,
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
        sourceContent: sourceFile.content,
      });
    }

    return {
      filePath: sourceFile.path,
      fileHash: hashString(sourceFile.content),
      fileStamp: context.fileStamp,
      content: sourceFile.content,
      cards,
      groupBlocks,
    };
  }

  private resolveIdentity(
    filePath: string,
    blockStartLine: number,
    rawBlockHash: string,
    markerNoteId: number | undefined,
    knownCardsByBlockKey: Map<string, CardState[]>,
    pendingByBlockKey: Map<string, PendingWriteBackState[]>,
    usedNoteIds: Set<number>,
  ): { noteId?: number; noteIdSource?: IndexedCard["noteIdSource"] } {
    if (markerNoteId !== undefined) {
      if (usedNoteIds.has(markerNoteId)) {
        return {};
      }

      return {
        noteId: markerNoteId,
        noteIdSource: "marker",
      };
    }

    const knownMatches = knownCardsByBlockKey.get(createKnownCardBlockKey(filePath, rawBlockHash)) ?? [];
    if (knownMatches.length === 1) {
      if (usedNoteIds.has(knownMatches[0].noteId)) {
        return {};
      }

      return {
        noteId: knownMatches[0].noteId,
        noteIdSource: "state-recovery",
      };
    }

    const pendingMatches = pendingByBlockKey.get(createPendingWriteBackKey(filePath, blockStartLine, rawBlockHash)) ?? [];
    if (pendingMatches.length === 1) {
      if (usedNoteIds.has(pendingMatches[0].targetNoteId)) {
        return {};
      }

      return {
        noteId: pendingMatches[0].targetNoteId,
        noteIdSource: "pending-writeback",
      };
    }

    return {};
  }

  private resolveGroupIdentity(
    src: string,
    rawBlockHash: string,
    markerNoteId: number | undefined,
    knownGroupBlocks: GroupBlockState[],
    usedNoteIds: Set<number>,
    usedGroupIds: Set<string>,
  ): { noteId?: number; groupId?: string; freeSlots: number[]; identitySource?: IndexedGroupCardBlock["identitySource"] } {
    if (markerNoteId !== undefined && !usedNoteIds.has(markerNoteId)) {
      const stateMatch = knownGroupBlocks.find((groupBlock) => !groupBlock.orphan && groupBlock.noteId === markerNoteId);
      if (!stateMatch) {
        return {
          noteId: markerNoteId,
          freeSlots: [],
          identitySource: "gi-marker",
        };
      }

      if (!usedGroupIds.has(stateMatch.groupId)) {
        return {
          noteId: stateMatch.noteId,
          groupId: stateMatch.groupId,
          freeSlots: [...stateMatch.freeSlots],
          identitySource: "gi-marker",
        };
      }
    }

    const srcMatches = knownGroupBlocks.filter((groupBlock) => !groupBlock.orphan && groupBlock.src === src);
    if (srcMatches.length === 1 && !usedGroupIds.has(srcMatches[0].groupId) && !usedNoteIds.has(srcMatches[0].noteId)) {
      return {
        noteId: srcMatches[0].noteId,
        groupId: srcMatches[0].groupId,
        freeSlots: [...srcMatches[0].freeSlots],
        identitySource: "state-recovery",
      };
    }

    const hashMatches = knownGroupBlocks.filter((groupBlock) => !groupBlock.orphan && groupBlock.rawBlockHash === rawBlockHash);
    if (hashMatches.length === 1 && !usedGroupIds.has(hashMatches[0].groupId) && !usedNoteIds.has(hashMatches[0].noteId)) {
      return {
        noteId: hashMatches[0].noteId,
        groupId: hashMatches[0].groupId,
        freeSlots: [...hashMatches[0].freeSlots],
        identitySource: "state-recovery",
      };
    }

    return {
      freeSlots: [],
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

function groupPendingWriteBackByBlockKey(pendingWriteBack: PendingWriteBackState[]): Map<string, PendingWriteBackState[]> {
  const grouped = new Map<string, PendingWriteBackState[]>();

  for (const pending of pendingWriteBack.filter((entry) => entry.markerKind !== "group-gi")) {
    const key = createPendingWriteBackKey(pending.filePath, pending.blockStartLine, pending.rawBlockHash);
    const entries = grouped.get(key);
    if (entries) {
      entries.push(pending);
      continue;
    }

    grouped.set(key, [pending]);
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
  let lastNonEmptyIndex = bodyLines.length - 1;
  while (lastNonEmptyIndex >= 0 && !bodyLines[lastNonEmptyIndex].trim()) {
    lastNonEmptyIndex -= 1;
  }

  if (lastNonEmptyIndex < 0) {
    return {
      bodyLines,
      contentEndLine: headingLine,
      idMarkerState: "missing",
    };
  }

  const lastLine = bodyLines[lastNonEmptyIndex];
  if (!markerService.isCandidate(lastLine)) {
    return {
      bodyLines,
      contentEndLine: findContentEndLine(bodyLines, bodyStartLine, headingLine),
      idMarkerState: "missing",
    };
  }

  const parsedMarker = markerService.parse(lastLine, bodyStartLine + lastNonEmptyIndex);
  const nextBodyLines = bodyLines.filter((_line, index) => index !== lastNonEmptyIndex);

  return {
    bodyLines: nextBodyLines,
    markerNoteId: parsedMarker?.noteId,
    contentEndLine: findContentEndLine(nextBodyLines, bodyStartLine, headingLine),
    markerLine: bodyStartLine + lastNonEmptyIndex,
    idMarkerState: parsedMarker ? "present-valid" : "present-invalid",
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