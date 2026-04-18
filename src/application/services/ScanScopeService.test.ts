import { describe, expect, it } from "vitest";

import { ScanScopeService } from "./ScanScopeService";

describe("ScanScopeService", () => {
  it("scans the whole vault when scopeMode is all", () => {
    const service = new ScanScopeService();
    const files = service.filter(
      [
        { path: "notes/one.md", basename: "one", content: "" },
        { path: "notes/two.md", basename: "two", content: "" },
        { path: "notes/three.txt", basename: "three", content: "" },
      ],
      "all",
      [],
      [],
    );

    expect(files.map((file) => file.path)).toEqual(["notes/one.md", "notes/two.md"]);
  });

  it("only scans folders selected by include mode", () => {
    const service = new ScanScopeService();
    const files = service.filter(
      [
        { path: "cards/a.md", basename: "a", content: "" },
        { path: "cards/archive/b.md", basename: "b", content: "" },
        { path: "other/c.md", basename: "c", content: "" },
      ],
      "include",
      ["cards"],
      [],
    );

    expect(files.map((file) => file.path)).toEqual(["cards/a.md", "cards/archive/b.md"]);
  });

  it("skips excluded folders in exclude mode", () => {
    const service = new ScanScopeService();
    const files = service.filter(
      [
        { path: "cards/a.md", basename: "a", content: "" },
        { path: "cards/archive/b.md", basename: "b", content: "" },
        { path: "other/c.md", basename: "c", content: "" },
      ],
      "exclude",
      [],
      ["cards/archive"],
    );

    expect(files.map((file) => file.path)).toEqual(["cards/a.md", "other/c.md"]);
  });
});