const PURE_TAG_TOKEN_REGEXP = /^#[^\s#.,，。;；:：!?！？()[\]{}<>]+(?:\/[^\s#.,，。;；:：!?！？()[\]{}<>]+)*$/u;

export function preprocessCardBodyMarkdown(markdownText: string, keepPureTagLines: boolean): string {
  if (keepPureTagLines || markdownText.length === 0) {
    return markdownText;
  }

  const lines = markdownText.split(/\r?\n/);
  const filteredLines = lines.filter((line) => !isPureTagLine(line));

  if (filteredLines.length === lines.length) {
    return markdownText;
  }

  return collapseBlankLines(trimBlankEdges(filteredLines)).join("\n");
}

export function isPureTagLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed.split(/\s+/).every((token) => PURE_TAG_TOKEN_REGEXP.test(token));
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

function collapseBlankLines(lines: string[]): string[] {
  const normalizedLines: string[] = [];

  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    const previousLine = normalizedLines[normalizedLines.length - 1];
    const previousBlank = previousLine !== undefined && previousLine.trim().length === 0;

    if (isBlank && previousBlank) {
      continue;
    }

    normalizedLines.push(isBlank ? "" : line);
  }

  return normalizedLines;
}