import { afterEach, describe, expect, it, vi } from "vitest";

import { PluginUserError, renderPluginFileFailure, renderPluginFileFailuresInline, renderUnknownUserFacingError, renderUserFacingMessage, renderUserMessage } from "./PluginUserError";

function setNavigatorLanguage(language: string): void {
  vi.stubGlobal("navigator", { language });
}

describe("PluginUserError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders plugin-owned errors in English", () => {
    setNavigatorLanguage("en");

    const error = new PluginUserError("errors.currentFileOutOfScope", { filePath: "notes/example.md" });

    expect(renderUserMessage(error)).toBe("The current file is outside the plugin scope: notes/example.md");
  });

  it("renders plugin-owned errors in Simplified Chinese", () => {
    setNavigatorLanguage("zh");

    const error = new PluginUserError("errors.currentFileOutOfScope", { filePath: "notes/example.md" });

    expect(renderUserMessage(error)).toBe("当前文件不在插件作用范围内：notes/example.md");
  });

  it("renders scope-not-configured errors in English and Chinese", () => {
    setNavigatorLanguage("en");
    expect(renderUserMessage(new PluginUserError("errors.runScopeNotConfigured"))).toBe(
      "Run scope is not configured. In include mode, select at least one folder before syncing.",
    );

    setNavigatorLanguage("zh");
    expect(renderUserMessage(new PluginUserError("errors.runScopeNotConfigured"))).toBe(
      "运行范围尚未配置。当前是 include 模式，请至少选择一个文件夹后再同步。",
    );
  });

  it("renders write-back failure summaries with localized detail lines", () => {
    setNavigatorLanguage("zh");

    const error = new PluginUserError(
      "errors.writeBack.summary",
      { fileCount: 2 },
      {
        failures: [
          { filePath: "a.md", key: "errors.writeBack.missingSourceContent" },
          { filePath: "b.md", rawMessage: "permission denied" },
        ],
      },
    );

    expect(renderUserMessage(error)).toBe([
      "Markdown 标记写回失败，共 2 个文件。",
      "a.md: 缺少用于写回标记的扫描源码内容。",
      "b.md: permission denied",
    ].join("\n"));
  });

  it("renders raw and keyed user-facing messages plus inline failure lists", () => {
    setNavigatorLanguage("en");

    expect(renderUserFacingMessage({ key: "notice.failedSavePluginSettings" })).toBe("Failed to save plugin settings.");
    expect(renderUserFacingMessage({ rawMessage: "raw failure" })).toBe("raw failure");
    expect(renderPluginFileFailure({ filePath: "a.md", key: "errors.markerRemoval.markdownFileNotFound" })).toBe("Markdown file was not found.");
    expect(renderPluginFileFailuresInline([
      { filePath: "a.md", key: "errors.markerRemoval.markdownFileNotFound" },
      { filePath: "b.md", rawMessage: "permission denied" },
    ])).toBe("a.md (Markdown file was not found.), b.md (permission denied)");
  });

  it("falls back to raw error messages for unknown errors", () => {
    setNavigatorLanguage("zh");

    expect(renderUnknownUserFacingError(new Error("socket closed"), "notice.vaultSyncFailed")).toBe("socket closed");
  });

  it("falls back to a translated default when the value is not an Error", () => {
    setNavigatorLanguage("en");

    expect(renderUnknownUserFacingError(null, "notice.vaultSyncFailed")).toBe("Vault sync failed.");
  });
});