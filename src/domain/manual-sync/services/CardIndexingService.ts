import {
  DEFAULT_SETTINGS,
  type CardAnswerCutoffMode,
  type CardTypeConfig,
  type CardTypeConfigId,
  type CardTypeConfigs,
} from "@/application/config/PluginSettings";
import type { SourceFile } from "@/domain/card/entities/SourceFile";
import { createIndexedCardSyncKey, type IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import { buildGroupSrc, createIndexedGroupSyncKey, type IndexedGroupCardBlock } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";
import type { IndexedFile } from "@/domain/manual-sync/entities/IndexedFile";
import { createPendingWriteBackKey, type CardState, type GroupBlockState, type PendingWriteBackState } from "@/domain/manual-sync/entities/PluginState";
import { hashString } from "@/domain/shared/hash";

import { resolveAnswerBoundary } from "./AnswerBoundaryParser";
import { CardMarkerService } from "./CardMarkerService";
import { DeckExtractionService } from "./DeckExtractionService";
import { QaGroupBlockParser } from "./QaGroupBlockParser";
import { SemanticQaListParser } from "./SemanticQaListParser";

interface HeadingMatch {
  level: number;
  text: string;
  lineIndex: number;
}

interface ResolvedHeadingConfigMatch {
  configId: CardTypeConfigId;
  config: CardTypeConfig;
}

export interface CardIndexingContext {
  cardTypeConfigs?: CardTypeConfigs;
  qaHeadingLevel?: number;
  clozeHeadingLevel?: number;
  cardAnswerCutoffMode?: CardAnswerCutoffMode;
  qaGroupMarker?: string;
  semanticQaMarker?: string;
  syncObsidianTagsToAnki?: boolean;
  fileStamp: string;
  knownCards: CardState[];
  knownGroupBlocks?: GroupBlockState[];
  pendingWriteBack: PendingWriteBackState[];
  fileDeckEnabled?: boolean;
  fileDeckMarker?: string;
}

const HEADING_REGEXP = /^(#{1,6})\s+(.*?)\s*$/;
const CARD_TYPE_MATCH_ORDER: CardTypeConfigId[] = ["qa-group", "semantic-qa", "cloze", "basic"];

export class CardIndexingService {
  constructor(
    private readonly markerService = new CardMarkerService(),
    private readonly deckExtractionService = new DeckExtractionService(),
    private readonly qaGroupBlockParser = new QaGroupBlockParser(),
    private readonly semanticQaListParser = new SemanticQaListParser(),
  ) {}

  index(sourceFile: SourceFile, context: CardIndexingContext): IndexedFile {
    const cardTypeConfigs = resolveCardTypeConfigs(context);
    validateResolvedCardTypeConfigs(cardTypeConfigs);

    const lines = sourceFile.content.split(/\r?\n/);
    const lineStartOffsets = computeLineStartOffsets(sourceFile.content);
    const headings = collectHeadings(lines);
    const extractedDeck = context.fileDeckEnabled
      ? this.deckExtractionService.extract(sourceFile, context.fileDeckMarker ?? "TARGET DECK")
      : { warnings: [] };
    const fileTags = resolveSourceFileTags(sourceFile, context.syncObsidianTagsToAnki);
    const cards: IndexedCard[] = [];
    const groupBlocks: IndexedGroupCardBlock[] = [];
    const knownCardsByBlockKey = groupKnownCardsByBlockKey(context.knownCards);
    const pendingByBlockKey = groupPendingWriteBackByBlockKey(context.pendingWriteBack);
    const usedNoteIds = new Set<number>();
    const usedGroupIds = new Set<string>();
    const knownGroupBlocks = context.knownGroupBlocks ?? [];

    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
      const heading = headings[headingIndex];
      const matchedConfig = resolveHeadingConfig(heading.text, heading.level, cardTypeConfigs);
      if (!matchedConfig) {
        continue;
      }

      const blockEndLineIndex = findBlockEndLineIndex(headings, headingIndex, lines.length);
      const bodyLines = lines.slice(heading.lineIndex + 1, blockEndLineIndex);
      const cutoffMode = context.cardAnswerCutoffMode ?? "heading-block";
      if (matchedConfig.configId === "qa-group") {
        const qaGroupMarker = matchedConfig.config.extraMarker;
        const parsedGroupBlock = this.qaGroupBlockParser.parse({
          parentHeadingText: heading.text,
          marker: qaGroupMarker,
          bodyLines,
          bodyStartLine: heading.lineIndex + 2,
          cardAnswerCutoffMode: cutoffMode,
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
          tagsHint: [...fileTags],
          items: parsedGroupBlock.items,
          groupMarker: parsedGroupBlock.groupMarker,
          freeSlots: parsedGroupBlock.groupMarker?.freeSlots ?? resolvedGroupIdentity.freeSlots,
          sourceContent: sourceFile.content,
        });

        continue;
      }

      if (matchedConfig.configId === "semantic-qa") {
        const semanticQaMarker = matchedConfig.config.extraMarker;
        for (const semanticCard of this.semanticQaListParser.parse({
          parentHeadingText: heading.text,
          marker: semanticQaMarker,
          bodyLines,
          bodyStartLine: heading.lineIndex + 2,
          cardAnswerCutoffMode: cutoffMode,
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
            tagsHint: [...fileTags],
            sourceContent: sourceFile.content,
          });
        }

        continue;
      }

      const cardType = matchedConfig.configId === "cloze" ? "cloze" : "basic";

      const boundary = resolveAnswerBoundary({
        lines: bodyLines,
        startLine: heading.lineIndex + 2,
        fallbackLine: heading.lineIndex + 1,
        cutoffMode,
        markerAdapter: this.markerService,
      });
      const trimmedBodyLines = trimBlankEdges(boundary.contentLines);
      const bodyMarkdown = trimmedBodyLines.join("\n");
      const rawBlockText = [lines[heading.lineIndex], ...trimmedBodyLines].join("\n").trimEnd();
      const rawBlockHash = hashString(rawBlockText);
      const resolvedIdentity = this.resolveIdentity(
        sourceFile.path,
        heading.lineIndex + 1,
        rawBlockHash,
        boundary.marker?.noteId,
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
        idMarkerState: boundary.markerState,
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
        contentEndLine: boundary.contentEndLine,
        markerLine: boundary.markerLine,
        markerIndent: boundary.markerIndent,
        rawBlockText,
        rawBlockHash,
        deckHint: extractedDeck.explicitDeckHint,
        deckHintSource: extractedDeck.explicitDeckSource,
        deckWarnings: [...extractedDeck.warnings],
        tagsHint: [...fileTags],
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

function resolveCardTypeConfigs(context: CardIndexingContext): CardTypeConfigs {
  if (context.cardTypeConfigs) {
    return context.cardTypeConfigs;
  }

  return {
    basic: {
      ...DEFAULT_SETTINGS.cardTypeConfigs.basic,
      headingLevel: context.qaHeadingLevel ?? DEFAULT_SETTINGS.cardTypeConfigs.basic.headingLevel,
    },
    "qa-group": {
      ...DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
      headingLevel: context.qaHeadingLevel ?? DEFAULT_SETTINGS.cardTypeConfigs["qa-group"].headingLevel,
      extraMarker: context.qaGroupMarker ?? DEFAULT_SETTINGS.cardTypeConfigs["qa-group"].extraMarker,
    },
    cloze: {
      ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
      headingLevel: context.clozeHeadingLevel ?? DEFAULT_SETTINGS.cardTypeConfigs.cloze.headingLevel,
    },
    "semantic-qa": {
      ...DEFAULT_SETTINGS.cardTypeConfigs["semantic-qa"],
      headingLevel: context.qaHeadingLevel ?? DEFAULT_SETTINGS.cardTypeConfigs["semantic-qa"].headingLevel,
      extraMarker: context.semanticQaMarker ?? DEFAULT_SETTINGS.cardTypeConfigs["semantic-qa"].extraMarker,
    },
  };
}

function validateResolvedCardTypeConfigs(cardTypeConfigs: CardTypeConfigs): void {
  const enabledDefaultCountByHeading = new Map<number, number>();

  for (const config of Object.values(cardTypeConfigs)) {
    if (!Number.isInteger(config.headingLevel) || config.headingLevel < 1 || config.headingLevel > 6) {
      throw new Error("Card heading level must be an integer between 1 and 6.");
    }

    if (!config.enabled || config.extraMarker.trim().length > 0) {
      continue;
    }

    enabledDefaultCountByHeading.set(config.headingLevel, (enabledDefaultCountByHeading.get(config.headingLevel) ?? 0) + 1);
  }

  if ([...enabledDefaultCountByHeading.values()].some((count) => count > 1)) {
    throw new Error("Each heading level can only have one enabled default card type.");
  }
}

function resolveHeadingConfig(headingText: string, level: number, cardTypeConfigs: CardTypeConfigs): ResolvedHeadingConfigMatch | null {
  const candidateMatches = CARD_TYPE_MATCH_ORDER
    .map((configId) => ({ configId, config: cardTypeConfigs[configId] }))
    .filter(({ config }) => config.enabled && config.headingLevel === level);

  const markerMatches = candidateMatches
    .filter(({ config }) => config.extraMarker.trim().length > 0 && headingText.trimEnd().endsWith(config.extraMarker.trim()))
    .sort((left, right) => {
      const markerLengthDifference = right.config.extraMarker.trim().length - left.config.extraMarker.trim().length;
      if (markerLengthDifference !== 0) {
        return markerLengthDifference;
      }

      return CARD_TYPE_MATCH_ORDER.indexOf(left.configId) - CARD_TYPE_MATCH_ORDER.indexOf(right.configId);
    });

  if (markerMatches.length > 0) {
    return markerMatches[0] ?? null;
  }

  return candidateMatches.find(({ config }) => config.extraMarker.trim().length === 0) ?? null;
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

function resolveSourceFileTags(sourceFile: SourceFile, syncObsidianTagsToAnki: boolean | undefined): string[] {
  if (syncObsidianTagsToAnki === false) {
    return [];
  }

  return Array.isArray(sourceFile.tags) ? [...sourceFile.tags] : [];
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

function computeLineStartOffsets(content: string): number[] {
  const offsets = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}