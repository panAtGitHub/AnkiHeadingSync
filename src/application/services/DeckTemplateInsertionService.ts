import type { FileDeckInsertLocation } from "@/application/config/PluginSettings";
import type { SourceFile } from "@/domain/card/entities/SourceFile";
import { DeckNormalizationService } from "@/domain/manual-sync/services/DeckNormalizationService";

export interface DeckTemplateInsertionResult {
  expectedContent: string;
  nextContent: string;
  insertedDeck: string;
}

export class DeckTemplateInsertionService {
  constructor(private readonly deckNormalizationService = new DeckNormalizationService()) {}

  insert(sourceFile: SourceFile, marker: string, template: string, location: FileDeckInsertLocation): DeckTemplateInsertionResult {
    const insertedDeck = this.expandTemplate(template, sourceFile.basename);
    const nextContent = location === "yaml"
      ? upsertFrontmatterDeck(sourceFile.content, marker, insertedDeck)
      : upsertBodyDeck(sourceFile.content, marker, insertedDeck);

    return {
      expectedContent: sourceFile.content,
      nextContent,
      insertedDeck,
    };
  }

  private expandTemplate(template: string, basename: string): string {
    return this.deckNormalizationService.normalize(template.replace(/\bfilename\b/g, basename));
  }
}

function upsertFrontmatterDeck(content: string, marker: string, deck: string): string {
  const lines = content.split(/\r?\n/);
  const frontmatterRange = findFrontmatterRange(lines);
  const yamlLine = `${marker}: ${deck}`;

  if (!frontmatterRange) {
    return ["---", yamlLine, "---", "", ...lines].join("\n");
  }

  const nextLines = [...lines];
  const markerRegexp = createMarkerKeyRegExp(marker);
  const frontmatterStart = frontmatterRange.start + 1;
  const frontmatterEnd = frontmatterRange.end;
  const existingIndex = nextLines.slice(frontmatterStart, frontmatterEnd).findIndex((line) => markerRegexp.test(line));

  if (existingIndex >= 0) {
    nextLines[frontmatterStart + existingIndex] = yamlLine;
    return nextLines.join("\n");
  }

  nextLines.splice(frontmatterEnd, 0, yamlLine);
  return nextLines.join("\n");
}

function upsertBodyDeck(content: string, marker: string, deck: string): string {
  const lines = content.split(/\r?\n/);
  const frontmatterRange = findFrontmatterRange(lines);
  const bodyStart = frontmatterRange ? frontmatterRange.end + 1 : 0;
  const prefixLines = lines.slice(0, bodyStart);
  const bodyLines = lines.slice(bodyStart);
  const declarationRange = findBodyDeclarationRange(bodyLines, marker);
  const inlineLine = `${marker}: ${deck}`;
  const nextBodyLines = [...bodyLines];

  if (declarationRange) {
    nextBodyLines.splice(declarationRange.start, declarationRange.end - declarationRange.start + 1, inlineLine);
    return [...prefixLines, ...nextBodyLines].join("\n");
  }

  const trimmedBodyLines = trimLeadingBlankLines(bodyLines);
  const insertedBodyLines = trimmedBodyLines.length > 0 ? [inlineLine, "", ...trimmedBodyLines] : [inlineLine];

  if (frontmatterRange) {
    return [...prefixLines, "", ...insertedBodyLines].join("\n");
  }

  return insertedBodyLines.join("\n");
}

function findFrontmatterRange(lines: string[]): { start: number; end: number } | undefined {
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---" || lines[index]?.trim() === "...") {
      return { start: 0, end: index };
    }
  }

  return undefined;
}

function findBodyDeclarationRange(lines: string[], marker: string): { start: number; end: number } | undefined {
  const inlineRegexp = new RegExp(`^\\s*${escapeRegExp(marker)}\\s*:\\s*(.+?)\\s*$`);
  const blockRegexp = new RegExp(`^\\s*${escapeRegExp(marker)}\\s*$`);
  let fenceMarker: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    if (inlineRegexp.test(lines[index] ?? "")) {
      return { start: index, end: index };
    }

    if (!blockRegexp.test(lines[index] ?? "")) {
      continue;
    }

    const nextValueIndex = findNextBodyValueIndex(lines, index + 1);
    return {
      start: index,
      end: nextValueIndex ?? index,
    };
  }

  return undefined;
}

function findNextBodyValueIndex(lines: string[], startIndex: number): number | undefined {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      return undefined;
    }

    return index;
  }

  return undefined;
}

function trimLeadingBlankLines(lines: string[]): string[] {
  let startIndex = 0;

  while (startIndex < lines.length && !(lines[startIndex] ?? "").trim()) {
    startIndex += 1;
  }

  return lines.slice(startIndex);
}

function createMarkerKeyRegExp(marker: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(marker)}\\s*:`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}