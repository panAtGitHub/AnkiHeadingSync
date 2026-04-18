import { describe, expect, it } from "vitest";

import { FolderDeckMappingService } from "./FolderDeckMappingService";

describe("FolderDeckMappingService", () => {
  it("maps nested folders to nested Anki decks", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("课程/数学/第一章/导数.md", "folder")).toEqual({
      deck: "课程::数学::第一章",
      warnings: [],
    });
    expect(service.mapFilePathToDeck("课程/数学/第一章/导数.md", "folder-and-file")).toEqual({
      deck: "课程::数学::第一章::导数",
      warnings: [],
    });
    expect(service.mapFilePathToDeck("课程/导数.md", "folder")).toEqual({
      deck: "课程",
      warnings: [],
    });
  });

  it("returns empty for root-level files", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("导数.md", "folder")).toEqual({ warnings: [] });
    expect(service.mapFilePathToDeck("导数.md", "folder-and-file")).toEqual({ warnings: [] });
  });

  it("emits a warning instead of throwing when a path segment contains deck separators", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("课程::非法/导数.md", "folder")).toEqual({
      warnings: [
        expect.objectContaining({
          filePath: "课程::非法/导数.md",
          code: "deck_invalid_folder_segment",
        }),
      ],
    });
  });
});