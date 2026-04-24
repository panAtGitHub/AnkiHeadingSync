import type { GroupMarker } from "@/domain/manual-sync/entities/IndexedGroupCardBlock";

import { applyNormalizedMarkerWrite } from "./MarkerWritebackNormalization";

export interface ParsedGroupMarker extends GroupMarker {
  raw: string;
  lineIndex: number;
}

export interface GroupMarkerWriteRequest {
  syncKey: string;
  filePath: string;
  blockStartLine: number;
  contentEndLine: number;
  blockEndLine: number;
  markerLine?: number;
  markerIndent?: string;
  noteId: number;
  groupId?: string;
  itemToSlot: Record<string, number>;
  freeSlots: number[];
  sourceContent: string;
}

export class GroupMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupMarkerError";
  }
}

const GROUP_MARKER_CANDIDATE_REGEXP = /<!--\s*GI:/;
const GROUP_MARKER_REGEXP = /^\s*<!--\s*GI:n=([1-9]\d*);i=([^;]*);f=([^;]*)\s*-->\s*$/;
const GROUP_ITEM_ID_REGEXP = /^[A-Za-z][A-Za-z0-9_-]*$/;

export class GroupMarkerService {
  isCandidate(line: string): boolean {
    return GROUP_MARKER_CANDIDATE_REGEXP.test(line);
  }

  parse(line: string, lineIndex: number): ParsedGroupMarker | null {
    const match = line.match(GROUP_MARKER_REGEXP);
    if (!match) {
      return null;
    }

    const noteId = Number(match[1]);
    const itemToSlot = parseItemToSlotMapping(match[2]);
    const freeSlots = parseFreeSlots(match[3]);
    validateSlotRanges(itemToSlot, freeSlots);

    return {
      noteId,
      itemToSlot,
      freeSlots,
      raw: match[0].trim(),
      lineIndex,
    };
  }

  create(noteId: number, itemToSlot: Record<string, number>, freeSlots: number[]): ParsedGroupMarker {
    validateSlotRanges(itemToSlot, freeSlots);

    return {
      noteId,
      itemToSlot: { ...itemToSlot },
      freeSlots: [...new Set(freeSlots)].sort((left, right) => left - right),
      raw: serializeGroupMarker(noteId, itemToSlot, freeSlots),
      lineIndex: -1,
    };
  }

  isEquivalent(marker: GroupMarker | undefined, noteId: number, itemToSlot: Record<string, number>, freeSlots: number[]): boolean {
    if (!marker || marker.noteId !== noteId) {
      return false;
    }

    const existingEntries = Object.entries(marker.itemToSlot).sort(compareMarkerEntry);
    const nextEntries = Object.entries(itemToSlot).sort(compareMarkerEntry);
    if (existingEntries.length !== nextEntries.length) {
      return false;
    }

    for (let index = 0; index < existingEntries.length; index += 1) {
      if (existingEntries[index][0] !== nextEntries[index][0] || existingEntries[index][1] !== nextEntries[index][1]) {
        return false;
      }
    }

    const existingFreeSlots = [...marker.freeSlots].sort((left, right) => left - right);
    const nextFreeSlots = [...freeSlots].sort((left, right) => left - right);
    if (existingFreeSlots.length !== nextFreeSlots.length) {
      return false;
    }

    return existingFreeSlots.every((slot, index) => slot === nextFreeSlots[index]);
  }

  validateBatch(sourceContent: string, writes: GroupMarkerWriteRequest[]): void {
    if (writes.length === 0) {
      return;
    }

    const filePath = writes[0]?.filePath;
    const seenBlocks = new Set<number>();

    for (const write of writes) {
      if (write.filePath !== filePath) {
        throw new GroupMarkerError("Batch GI marker writes must belong to the same Markdown file.");
      }

      if (write.sourceContent !== sourceContent) {
        throw new GroupMarkerError(`GI marker writes for ${write.filePath} must share the scanned source content.`);
      }

      if (write.markerLine !== undefined && write.markerLine < write.blockStartLine) {
        throw new GroupMarkerError(`Cannot replace GI marker outside the heading block in ${write.filePath}.`);
      }

      if (write.contentEndLine < write.blockStartLine || write.contentEndLine > write.blockEndLine) {
        throw new GroupMarkerError(`Cannot place GI marker outside the content range in ${write.filePath}.`);
      }

      if (seenBlocks.has(write.blockStartLine)) {
        throw new GroupMarkerError(`Duplicate GI marker write detected for block ${write.blockStartLine} in ${write.filePath}.`);
      }

      seenBlocks.add(write.blockStartLine);
    }
  }

  applyBatch(sourceContent: string, writes: GroupMarkerWriteRequest[]): string {
    if (writes.length === 0) {
      return sourceContent;
    }

    this.validateBatch(sourceContent, writes);
    const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = sourceContent.split(/\r?\n/);

    const sortedWrites = [...writes].sort((left, right) => right.blockStartLine - left.blockStartLine);
    for (const write of sortedWrites) {
      this.applyWrite(lines, write);
    }

    return lines.join(lineEnding);
  }

  applyWrite(lines: string[], write: GroupMarkerWriteRequest): void {
    applyNormalizedMarkerWrite(lines, {
      contentEndLine: write.contentEndLine,
      blockEndLine: write.blockEndLine,
      markerLine: write.markerLine,
      markerIndent: write.markerIndent,
      renderedMarker: serializeGroupMarker(write.noteId, write.itemToSlot, write.freeSlots),
      additionalRemovalLineIndexes: collectLegacyIdMarkerLineIndexes(lines, write.blockStartLine, write.blockEndLine),
    });
  }
}

export function serializeGroupMarker(noteId: number, itemToSlot: Record<string, number>, freeSlots: number[]): string {
  validateSlotRanges(itemToSlot, freeSlots);
  const itemEntries = Object.entries(itemToSlot)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([itemId, slot]) => `${itemId}:${slot}`)
    .join(",");
  const freeEntry = [...new Set(freeSlots)].sort((left, right) => left - right).join(",");
  return `<!--GI:n=${noteId};i=${itemEntries};f=${freeEntry}-->`;
}

function parseItemToSlotMapping(rawValue: string): Record<string, number> {
  if (!rawValue.trim()) {
    return {};
  }

  const itemToSlot: Record<string, number> = {};
  const usedSlots = new Set<number>();

  for (const entry of rawValue.split(",")) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      continue;
    }

    const [itemId, slotValue] = trimmedEntry.split(":");
    if (!itemId || !slotValue || !GROUP_ITEM_ID_REGEXP.test(itemId)) {
      throw new GroupMarkerError(`Invalid GI item mapping entry: ${entry}`);
    }

    const slot = Number(slotValue);
    if (!Number.isInteger(slot) || slot < 1) {
      throw new GroupMarkerError(`Invalid GI slot value: ${slotValue}`);
    }

    if (itemToSlot[itemId] !== undefined || usedSlots.has(slot)) {
      throw new GroupMarkerError(`Duplicate GI mapping entry detected: ${entry}`);
    }

    itemToSlot[itemId] = slot;
    usedSlots.add(slot);
  }

  return itemToSlot;
}

function parseFreeSlots(rawValue: string): number[] {
  if (!rawValue.trim()) {
    return [];
  }

  const freeSlots: number[] = [];
  const seen = new Set<number>();
  for (const part of rawValue.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const slot = Number(trimmed);
    if (!Number.isInteger(slot) || slot < 1) {
      throw new GroupMarkerError(`Invalid GI free slot value: ${trimmed}`);
    }

    if (seen.has(slot)) {
      throw new GroupMarkerError(`Duplicate GI free slot detected: ${trimmed}`);
    }

    seen.add(slot);
    freeSlots.push(slot);
  }

  return freeSlots.sort((left, right) => left - right);
}

function validateSlotRanges(itemToSlot: Record<string, number>, freeSlots: number[]): void {
  const usedSlots = new Set<number>();
  for (const slot of Object.values(itemToSlot)) {
    if (!Number.isInteger(slot) || slot < 1) {
      throw new GroupMarkerError(`GI item slot must be a positive integer. Received: ${slot}`);
    }

    usedSlots.add(slot);
  }

  for (const slot of freeSlots) {
    if (!Number.isInteger(slot) || slot < 1) {
      throw new GroupMarkerError(`GI free slot must be a positive integer. Received: ${slot}`);
    }

    if (usedSlots.has(slot)) {
      throw new GroupMarkerError(`GI free slot ${slot} overlaps with an occupied slot.`);
    }
  }
}

function collectLegacyIdMarkerLineIndexes(lines: string[], blockStartLine: number, blockEndLine: number): number[] {
  const indexes: number[] = [];

  for (let lineIndex = blockStartLine; lineIndex < blockEndLine; lineIndex += 1) {
    if (/^\s*<!--\s*ID:/i.test(lines[lineIndex] ?? "")) {
      indexes.push(lineIndex);
    }
  }

  return indexes;
}

function compareMarkerEntry(left: [string, number], right: [string, number]): number {
  return left[1] - right[1] || left[0].localeCompare(right[0]);
}
