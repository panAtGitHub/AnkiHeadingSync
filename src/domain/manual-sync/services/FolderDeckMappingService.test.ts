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

  it("uses the opposite folder deck mode inside alternate override folders", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("notes/sub/topic.md", "folder", ["notes/sub"]).deck).toBe("notes::sub::topic");
    expect(service.mapFilePathToDeck("notes/sub/topic.md", "folder-and-file", ["notes/sub"]).deck).toBe("notes::sub");
  });

  it("applies alternate overrides to descendants without matching sibling prefixes", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("notes/sub/topic.md", "folder", ["notes"]).deck).toBe("notes::sub::topic");
    expect(service.mapFilePathToDeck("notes2/sub/topic.md", "folder", ["notes"]).deck).toBe("notes2::sub");
  });

  it("ignores alternate overrides when folder deck mode is off", () => {
    const service = new FolderDeckMappingService();

    expect(service.mapFilePathToDeck("notes/sub/topic.md", "off", ["notes/sub"])).toEqual({ warnings: [] });
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