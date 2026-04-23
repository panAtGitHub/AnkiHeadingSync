import { describe, expect, it } from "vitest";

import { GroupMarkerService } from "./GroupMarkerService";

describe("GroupMarkerService", () => {
  it("rewrites the trailing GI marker and removes legacy inner ID markers", () => {
    const service = new GroupMarkerService();
    const sourceContent = [
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "  <!--ID: 42-->",
      "- Beta",
      "  - Second answer",
      "",
      "",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
      "",
      "#### Next heading",
    ].join("\n");

    const nextContent = service.applyBatch(sourceContent, [{
      syncKey: "notes/example.md\u0000group\u00001\u0000hash",
      filePath: "notes/example.md",
      blockStartLine: 1,
      contentEndLine: 6,
      blockEndLine: 9,
      markerLine: 9,
      noteId: 42,
      itemToSlot: { item_a: 1, item_b: 2 },
      freeSlots: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      sourceContent,
    }]);

    expect(nextContent).not.toContain("<!--ID: 42-->");
    expect(nextContent).toBe([
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "- Beta",
      "  - Second answer",
      "<!--GI:n=42;i=item_a:1,item_b:2;f=3,4,5,6,7,8,9,10,11,12-->",
      "",
      "",
      "#### Next heading",
    ].join("\n"));
  });

  it("writes GI after the answer region and keeps exactly two blank lines before trailing remarks", () => {
    const service = new GroupMarkerService();
    const sourceContent = [
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "",
      "",
      "Remarks",
    ].join("\n");

    const nextContent = service.applyBatch(sourceContent, [{
      syncKey: "notes/example.md\u0000group\u00001\u0000hash",
      filePath: "notes/example.md",
      blockStartLine: 1,
      contentEndLine: 3,
      blockEndLine: 6,
      noteId: 42,
      itemToSlot: { item_a: 1 },
      freeSlots: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      sourceContent,
    }]);

    expect(nextContent).toBe([
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
      "",
      "",
      "Remarks",
    ].join("\n"));
  });
});
