import type { ClozeMode } from "@/domain/manual-sync/entities/IndexedCard";

export const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
export const FENCED_CODE_PATTERN = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
export const HIGHLIGHT_PATTERN = /==(.+?)==/g;
export const BRACE_CLOZE_PATTERN = /(?:(?<!{){(?:c?(\d+)[:|])?(?!{))((?:[^\n][\n]?)+?)(?:(?<!})}(?!}))/g;
export const NATIVE_CLOZE_PATTERN = /\{\{c(\d+)::[\s\S]+?\}\}/g;

export interface CollectClozeNumbersInput {
  bodyMarkdown: string;
  clozeMode: ClozeMode;
  convertHighlightsToCloze: boolean;
}

export function collectClozeNumbers(input: CollectClozeNumbersInput): Set<number> {
  const sourceMarkdown = input.convertHighlightsToCloze
    ? input.bodyMarkdown.replace(HIGHLIGHT_PATTERN, "{$1}")
    : input.bodyMarkdown;
  const protectedBlocks = protectSegments(sourceMarkdown, FENCED_CODE_PATTERN, "FENCED_CODE");
  const protectedInline = protectSegments(protectedBlocks.text, INLINE_CODE_PATTERN, "INLINE_CODE");
  const clozeNumbers = new Set<number>();
  let nextClozeIndex = 1;

  for (const match of protectedInline.text.matchAll(NATIVE_CLOZE_PATTERN)) {
    const clozeIndex = Number(match[1]);
    if (Number.isInteger(clozeIndex) && clozeIndex > 0) {
      clozeNumbers.add(clozeIndex);
    }
  }

  for (const match of protectedInline.text.matchAll(BRACE_CLOZE_PATTERN)) {
    const explicitIndex = match[1];
    const clozeIndex = explicitIndex
      ? Number(explicitIndex)
      : (input.clozeMode === "all" ? 1 : nextClozeIndex++);

    if (Number.isInteger(clozeIndex) && clozeIndex > 0) {
      clozeNumbers.add(clozeIndex);
    }
  }

  return clozeNumbers;
}

export function protectSegments(
  text: string,
  pattern: RegExp,
  prefix: string,
): { text: string; restore: (value: string, formatter?: (segment: string) => string) => string } {
  const matches: string[] = [];
  const nextText = text.replace(pattern, (segment) => {
    const token = `@@${prefix}_${matches.length}@@`;
    matches.push(segment);
    return token;
  });

  return {
    text: nextText,
    restore: (value: string, formatter = (segment: string) => segment) =>
      matches.reduce((current, segment, index) => current.split(`@@${prefix}_${index}@@`).join(formatter(segment)), value),
  };
}