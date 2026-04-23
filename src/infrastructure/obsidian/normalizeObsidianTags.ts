export function normalizeObsidianTags(rawTags: Iterable<string> | null | undefined): string[] {
  if (!rawTags) {
    return [];
  }

  const normalizedTags: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") {
      continue;
    }

    const withoutPrefix = rawTag.startsWith("#") ? rawTag.slice(1) : rawTag;
    const segments = withoutPrefix
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      continue;
    }

    const normalized = segments.join("::");
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedTags.push(normalized);
  }

  return normalizedTags;
}