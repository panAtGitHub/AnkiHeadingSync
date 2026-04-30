import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getLanguageMock, noticeRecords } = vi.hoisted(() => {
  const hoistedGetLanguage = vi.fn(() => "en");
  const hoistedNoticeRecords: Array<{ message: string; timeout?: number }> = [];

  class HoistedNotice {
    constructor(message: string, timeout?: number) {
      hoistedNoticeRecords.push({ message, timeout });
    }
  }

  return {
    getLanguageMock: hoistedGetLanguage,
    noticeRecords: hoistedNoticeRecords,
    HoistedNotice,
  };
});

vi.mock("obsidian", () => ({
  getLanguage: getLanguageMock,
  Notice: class {
    constructor(message: string, timeout?: number) {
      noticeRecords.push({ message, timeout });
    }
  },
}));

import type { ClearCurrentFileSyncedCardsResult, CleanupEmptyDecksResult } from "@/application/use-cases/cleanupResetTypes";
import type { ManualSyncResult } from "@/application/use-cases/manualSyncTypes";

import { NoticeService } from "./NoticeService";

function setNavigatorLanguage(language: string): void {
  vi.stubGlobal("navigator", { language });
}

function createManualSyncResult(overrides: Partial<ManualSyncResult> = {}): ManualSyncResult {
  return {
    scannedFiles: 3,
    scannedCards: 8,
    created: 2,
    rebuilt: 1,
    updated: 1,
    migratedNoteTypes: 1,
    migratedDecks: 1,
    orphaned: 0,
    uploadedMedia: 4,
    skippedUnchangedCards: 5,
    rewrittenMarkers: 2,
    markerWriteConflictFiles: [],
    warnings: [],
    ...overrides,
  };
}

function createClearResult(overrides: Partial<ClearCurrentFileSyncedCardsResult> = {}): ClearCurrentFileSyncedCardsResult {
  return {
    trackedCards: 2,
    trackedGroups: 1,
    deletedNotes: 3,
    removedMarkers: 4,
    removedCardMarkers: 2,
    removedGroupMarkers: 2,
    deletedLocalRecords: 3,
    conflictFiles: [],
    failureFiles: [],
    ...overrides,
  };
}

function createCleanupResult(overrides: Partial<CleanupEmptyDecksResult> = {}): CleanupEmptyDecksResult {
  return {
    candidateCount: 4,
    selectedCount: 3,
    deletedCount: 2,
    deletedDeckNames: ["Deck A", "Deck B"],
    skippedDeckNames: ["Deck C"],
    ...overrides,
  };
}

describe("NoticeService", () => {
  beforeEach(() => {
    noticeRecords.length = 0;
    getLanguageMock.mockReset();
    getLanguageMock.mockReturnValue("en");
    setNavigatorLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders sync summary and deck warnings in English", () => {
    const service = new NoticeService();

    service.showSyncSummary("currentFile", createManualSyncResult({
      markerWriteConflictFiles: ["notes/a.md", "notes/b.md"],
      warnings: [
        { filePath: "notes/a.md", code: "deck_conflict_yaml_body", params: { marker: "TARGET DECK" } },
        { filePath: "notes/b.md", code: "deck_fallback_default" },
      ],
    }));

    expect(noticeRecords.map((entry) => entry.message)).toEqual([
      "Current file sync completed: files 3, cards 8, created 2, rebuilt 1, updated 1, migrated note types 1, migrated decks 1, orphaned 0, media 4, skipped 5. Marker write conflicts: notes/a.md, notes/b.md. Warnings: 2.",
      "Conflicting TARGET DECK declarations were found in YAML and body. This sync used the YAML value.",
      "No explicit deck was found and a folder-based deck could not be generated, so the default deck was used.",
    ]);
  });

  it("renders clear-current-file summaries with localized failures", () => {
    setNavigatorLanguage("zh");
    const service = new NoticeService();

    service.showClearCurrentFileSummary(createClearResult({
      conflictFiles: ["notes/reset.md"],
      failureFiles: [
        { filePath: "notes/a.md", key: "errors.markerRemoval.markdownFileNotFound" },
        { filePath: "notes/b.md", rawMessage: "permission denied" },
      ],
    }));

    expect(noticeRecords.map((entry) => entry.message)).toEqual([
      "当前文件已同步卡片清空完成：已跟踪卡片 2，已跟踪分组 1，删除笔记 3，移除标记 4，移除 ID 标记 2，移除 GI 标记 2，删除本地记录 3。 标记移除冲突：notes/reset.md。 失败项：notes/a.md (Markdown 文件不存在。)、notes/b.md (permission denied)。",
    ]);
  });

  it("renders cleanup summary and skipped decks in English", () => {
    const service = new NoticeService();

    service.showCleanupEmptyDecksSummary(createCleanupResult({
      skippedDeckNames: ["Deck C", "Deck D"],
    }));

    expect(noticeRecords.map((entry) => entry.message)).toEqual([
      "Empty-deck cleanup completed: candidates 4, selected 3, deleted 2, skipped 2. Skipped decks: Deck C, Deck D.",
    ]);
  });
});