import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { ExplicitDeckExtractionResult } from "@/domain/manual-sync/value-objects/DeckResolution";

import { DeckNormalizationService } from "./DeckNormalizationService";

export class DeckExtractionService {
  constructor(private readonly deckNormalizationService = new DeckNormalizationService()) {}

  extract(sourceFile: SourceFile, marker = "TARGET DECK"): ExplicitDeckExtractionResult {
    const lines = sourceFile.content.split(/\r?\n/);
    const warnings = [] as ExplicitDeckExtractionResult["warnings"];
    const frontmatterRange = findFrontmatterRange(lines);
    const frontmatterDeck = frontmatterRange
      ? this.extractFrontmatterDeck(lines.slice(frontmatterRange.start + 1, frontmatterRange.end), marker)
      : undefined;
    const bodyResult = this.extractBodyDeck(
      lines,
      frontmatterRange?.end !== undefined ? frontmatterRange.end + 1 : 0,
      sourceFile.path,
      marker,
    );

    warnings.push(...bodyResult.warnings);

    if (frontmatterDeck && bodyResult.bodyDeck) {
      if (frontmatterDeck === bodyResult.bodyDeck) {
        return {
          frontmatterDeck,
          bodyDeck: bodyResult.bodyDeck,
          explicitDeckHint: frontmatterDeck,
          explicitDeckSource: "frontmatter",
          warnings,
        };
      }

      warnings.push({
        filePath: sourceFile.path,
        code: "deck_conflict_yaml_body",
        message: "检测到同一文件同时在 YAML 和正文中声明了不同的 TARGET DECK，本次已按 YAML 值同步，请清理冲突配置。",
      });

      return {
        frontmatterDeck,
        bodyDeck: bodyResult.bodyDeck,
        explicitDeckHint: frontmatterDeck,
        explicitDeckSource: "frontmatter",
        warnings,
      };
    }

    if (frontmatterDeck) {
      return {
        frontmatterDeck,
        explicitDeckHint: frontmatterDeck,
        explicitDeckSource: "frontmatter",
        warnings,
      };
    }

    if (bodyResult.bodyDeck) {
      return {
        bodyDeck: bodyResult.bodyDeck,
        explicitDeckHint: bodyResult.bodyDeck,
        explicitDeckSource: "body",
        warnings,
      };
    }

    return {
      warnings,
    };
  }

  private extractFrontmatterDeck(frontmatterLines: string[], marker: string): string | undefined {
    const frontmatterTargetDeckRegexp = createFrontmatterMarkerRegExp(marker);

    for (const line of frontmatterLines) {
      const match = line.match(frontmatterTargetDeckRegexp);
      if (!match) {
        continue;
      }

      return this.deckNormalizationService.normalize(unwrapQuotedScalar(match[1] ?? ""));
    }

    return undefined;
  }

  private extractBodyDeck(
    lines: string[],
    startLineIndex: number,
    filePath: string,
    marker: string,
  ): { bodyDeck?: string; warnings: ExplicitDeckExtractionResult["warnings"] } {
    const warnings = [] as ExplicitDeckExtractionResult["warnings"];
    const declarations: string[] = [];
    let fenceMarker: string | null = null;
    const bodyTargetDeckInlineRegexp = createBodyInlineMarkerRegExp(marker);
    const bodyTargetDeckBlockRegexp = createBodyBlockMarkerRegExp(marker);

    for (let lineIndex = startLineIndex; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const trimmed = line.trim();

      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        fenceMarker = fenceMarker ? null : trimmed.slice(0, 3);
        continue;
      }

      if (fenceMarker) {
        continue;
      }

      const inlineMatch = line.match(bodyTargetDeckInlineRegexp);
      if (inlineMatch) {
        declarations.push(this.deckNormalizationService.normalize(inlineMatch[1] ?? ""));
        continue;
      }

      if (!bodyTargetDeckBlockRegexp.test(line)) {
        continue;
      }

      const nextValue = findNextBodyDeckValue(lines, lineIndex + 1);
      if (nextValue) {
        declarations.push(this.deckNormalizationService.normalize(nextValue));
      }
    }

    if (declarations.length > 1) {
      warnings.push({
        filePath,
        code: "deck_multiple_body_declarations",
        message: "检测到同一文件存在多个 TARGET DECK 声明，本次只使用第一个正文 deck 声明。",
      });
    }

    return {
      bodyDeck: declarations[0],
      warnings,
    };
  }
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

function findNextBodyDeckValue(lines: string[], startLineIndex: number): string | undefined {
  for (let index = startLineIndex; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      return undefined;
    }

    return trimmed;
  }

  return undefined;
}

function unwrapQuotedScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function createFrontmatterMarkerRegExp(marker: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(marker)}\\s*:\\s*(.*?)\\s*$`);
}

function createBodyInlineMarkerRegExp(marker: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(marker)}\\s*:\\s*(.+?)\\s*$`);
}

function createBodyBlockMarkerRegExp(marker: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(marker)}\\s*$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}