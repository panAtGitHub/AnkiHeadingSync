import { describe, expect, it } from "vitest";

import { ScanScopeService } from "./ScanScopeService";

describe("ScanScopeService", () => {
  it("scans the whole vault when includeFolders is empty", () => {
    const service = new ScanScopeService();
    const files = service.filter(
      [
        { path: "notes/one.md", basename: "one", content: "" },
        { path: "notes/two.md", basename: "two", content: "" },
        { path: "notes/three.txt", basename: "three", content: "" },
      ],
      [],
      [],
    );

    expect(files.map((file) => file.path)).toEqual(["notes/one.md", "notes/two.md"]);
  });

  it("applies includeFolders and excludeFolders together", () => {
    const service = new ScanScopeService();
    const files = service.filter(
      [
        { path: "cards/a.md", basename: "a", content: "" },
        { path: "cards/archive/b.md", basename: "b", content: "" },
        { path: "other/c.md", basename: "c", content: "" },
      ],
      ["cards"],
      ["cards/archive"],
    );

    expect(files.map((file) => file.path)).toEqual(["cards/a.md"]);
  });
});