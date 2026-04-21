import { describe, expect, it } from "vitest";

import { FakeManualSyncVaultGateway } from "@/test-support/manualSyncFakes";

import { MarkdownSyncedMarkerRemovalService } from "./MarkdownSyncedMarkerRemovalService";

describe("MarkdownSyncedMarkerRemovalService", () => {
  it("removes matching ID and GI markers in one write while preserving body content", async () => {
    const filePath = "notes/example.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 41-->",
      "",
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
      "",
      "#### Next",
      "Body",
      "<!--ID: 99-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    const service = new MarkdownSyncedMarkerRemovalService(vaultGateway);

    const result = await service.remove(
      filePath,
      [{ noteId: 41 }],
      [{ noteId: 42, groupId: "group-1", blockStartLine: 5 }],
    );

    expect(result).toEqual({
      removedCardMarkers: 1,
      removedGroupMarkers: 1,
      removedMarkers: 2,
      conflictFiles: [],
      failureFiles: [],
    });
    expect(vaultGateway.replaceCalls).toHaveLength(1);
    expect(vaultGateway.getFileContent(filePath)).toBe([
      "#### Prompt",
      "Answer",
      "",
      "#### Concepts #anki-list",
      "- Alpha",
      "  - First answer",
      "",
      "#### Next",
      "Body",
      "<!--ID: 99-->",
    ].join("\n"));
  });

  it("reports conflicts without claiming removed markers", async () => {
    const filePath = "notes/conflict.md";
    const content = [
      "#### Prompt",
      "Answer",
      "<!--ID: 41-->",
      "<!--GI:n=42;i=item_a:1;f=2,3,4,5,6,7,8,9,10,11,12-->",
    ].join("\n");
    const vaultGateway = new FakeManualSyncVaultGateway({
      [filePath]: content,
    });
    vaultGateway.conflictPaths.add(filePath);
    const service = new MarkdownSyncedMarkerRemovalService(vaultGateway);

    const result = await service.remove(
      filePath,
      [{ noteId: 41 }],
      [{ noteId: 42, groupId: "group-1", blockStartLine: 1 }],
    );

    expect(result).toEqual({
      removedCardMarkers: 0,
      removedGroupMarkers: 0,
      removedMarkers: 0,
      conflictFiles: [filePath],
      failureFiles: [],
    });
    expect(vaultGateway.getFileContent(filePath)).toBe(content);
  });
});