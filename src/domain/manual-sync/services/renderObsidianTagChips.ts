import { normalizeObsidianTags } from "@/infrastructure/obsidian/normalizeObsidianTags";

const TAG_TOKEN_SOURCE = "#[^\\s#.,，。;；:：!?！？()[\\]{}<>]+(?:\\/[^\\s#.,，。;；:：!?！？()[\\]{}<>]+)*";
const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const FENCED_CODE_PATTERN = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const PRECEDING_TAG_TEXT_PATTERN = /[\p{L}\p{N}_/#]/u;
const EXCLUDED_HTML_TAGS = new Set(["code", "pre"]);

const TAG_CHIP_CLASS = "ahs-ob-tag";
const TAG_CHIP_STYLE = [
  "display:inline-block",
  "padding:1px 8px",
  "border-radius:999px",
  "background:rgba(90,120,255,.12)",
  "color:#5865d6",
  "font-weight:500",
  "line-height:1.5",
  "margin:0 4px 2px 0",
].join(";");

export function renderObsidianTagChipsInText(text: string): string {
  if (!text || !text.includes("#")) {
    return text;
  }

  const protectedBlocks = protectSegments(text, FENCED_CODE_PATTERN, "FENCED_CODE");
  const protectedInline = protectSegments(protectedBlocks.text, INLINE_CODE_PATTERN, "INLINE_CODE");
  const transformed = replaceTagTokens(protectedInline.text);

  return protectedBlocks.restore(protectedInline.restore(transformed));
}

export function renderObsidianTagChipsInHtml(html: string): string {
  if (!html || !html.includes("#")) {
    return html;
  }

  let result = "";
  let index = 0;
  const excludedTagStack: string[] = [];

  while (index < html.length) {
    const nextTagIndex = html.indexOf("<", index);
    const textEnd = nextTagIndex === -1 ? html.length : nextTagIndex;

    if (textEnd > index) {
      const segment = html.slice(index, textEnd);
      result += excludedTagStack.length === 0 ? replaceTagTokens(segment) : segment;
      index = textEnd;
    }

    if (index >= html.length) {
      break;
    }

    const tagEnd = html.indexOf(">", index);
    if (tagEnd === -1) {
      const remainder = html.slice(index);
      result += excludedTagStack.length === 0 ? replaceTagTokens(remainder) : remainder;
      break;
    }

    const tagSource = html.slice(index, tagEnd + 1);
    updateExcludedTagStack(tagSource, excludedTagStack);
    result += tagSource;
    index = tagEnd + 1;
  }

  return result;
}

function replaceTagTokens(text: string): string {
  const pattern = new RegExp(TAG_TOKEN_SOURCE, "gu");
  let nextText = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawTag = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + rawTag.length;

    if (!hasValidTagBoundary(text, startIndex)) {
      continue;
    }

    const normalizedTag = normalizeObsidianTags([rawTag])[0];
    if (!normalizedTag) {
      continue;
    }

    nextText += text.slice(lastIndex, startIndex);
    nextText += buildTagChip(rawTag, normalizedTag);
    lastIndex = endIndex;
  }

  if (lastIndex === 0) {
    return text;
  }

  return nextText + text.slice(lastIndex);
}

function hasValidTagBoundary(text: string, startIndex: number): boolean {
  if (startIndex === 0) {
    return true;
  }

  return !PRECEDING_TAG_TEXT_PATTERN.test(text[startIndex - 1] ?? "");
}

function buildTagChip(rawTag: string, normalizedTag: string): string {
  return `<span class="${TAG_CHIP_CLASS}" data-tag="${escapeHtml(normalizedTag)}" style="${TAG_CHIP_STYLE}">${escapeHtml(rawTag)}</span>`;
}

function updateExcludedTagStack(tagSource: string, excludedTagStack: string[]): void {
  const match = /^<\s*(\/)?\s*([a-zA-Z0-9-]+)/.exec(tagSource);
  if (!match) {
    return;
  }

  const isClosingTag = Boolean(match[1]);
  const tagName = match[2]?.toLowerCase();
  if (!tagName || !EXCLUDED_HTML_TAGS.has(tagName)) {
    return;
  }

  if (isClosingTag) {
    for (let index = excludedTagStack.length - 1; index >= 0; index -= 1) {
      if (excludedTagStack[index] === tagName) {
        excludedTagStack.splice(index, 1);
        break;
      }
    }
    return;
  }

  if (!/\/\s*>$/.test(tagSource)) {
    excludedTagStack.push(tagName);
  }
}

function protectSegments(
  text: string,
  pattern: RegExp,
  prefix: string,
): { text: string; restore: (value: string) => string } {
  const matches: string[] = [];
  const nextText = text.replace(pattern, (segment) => {
    const token = `@@${prefix}_${matches.length}@@`;
    matches.push(segment);
    return token;
  });

  return {
    text: nextText,
    restore: (value: string) =>
      matches.reduce((current, segment, index) => current.split(`@@${prefix}_${index}@@`).join(segment), value),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
