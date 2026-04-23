function uniqueNonEmptyTags(tags: string[] | undefined): string[] {
  const uniqueTags: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags ?? []) {
    if (typeof tag !== "string" || tag.length === 0 || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    uniqueTags.push(tag);
  }

  return uniqueTags;
}

export function areTagSetsEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftTags = uniqueNonEmptyTags(left);
  const rightTags = uniqueNonEmptyTags(right);

  if (leftTags.length !== rightTags.length) {
    return false;
  }

  const rightSet = new Set(rightTags);
  return leftTags.every((tag) => rightSet.has(tag));
}

export function diffTagSets(target: string[] | undefined, current: string[] | undefined): { addTags: string[]; removeTags: string[] } {
  const targetTags = uniqueNonEmptyTags(target);
  const currentTags = uniqueNonEmptyTags(current);
  const targetSet = new Set(targetTags);
  const currentSet = new Set(currentTags);

  return {
    addTags: targetTags.filter((tag) => !currentSet.has(tag)),
    removeTags: currentTags.filter((tag) => !targetSet.has(tag)),
  };
}