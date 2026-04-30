import { describe, expect, it } from "vitest";
import { TFile, TFolder } from "obsidian";

import { MarkdownFileNotFoundError, MarkdownWriteConflictError } from "@/application/ports/VaultGateway";

import { ObsidianVaultGateway } from "./ObsidianVaultGateway";
import { normalizeObsidianTags } from "./normalizeObsidianTags";

describe("ObsidianVaultGateway", () => {
  it("reads metadata cache tags and normalizes nested, emoji, and Chinese tags", async () => {
    const FileCtor = TFile as unknown as new (path: string) => TFile;
    const file = new FileCtor("notes/example.md");
    const gateway = new ObsidianVaultGateway({
      vault: {
        getAbstractFileByPath: () => file,
        cachedRead: () => Promise.resolve("# Title\nBody"),
      },
      metadataCache: {
        getFileCache: () => ({
          frontmatter: {
            tags: ["#📖/一人公司", "#3地区"],
          },
          tags: [
            { tag: "#3地区" },
            { tag: "#a/b/c" },
            { tag: "#📖/一人公司" },
          ],
        }),
      },
    } as never);

    await expect(gateway.readMarkdownFile("notes/example.md")).resolves.toMatchObject({
      path: "notes/example.md",
      basename: "example",
      content: "# Title\nBody",
      tags: ["3地区", "a::b::c", "📖::一人公司"],
    });
  });

  it("returns an empty tag list when metadata cache is missing or has no tags", async () => {
    const FileCtor = TFile as unknown as new (path: string) => TFile;
    const file = new FileCtor("notes/example.md");
    const gateway = new ObsidianVaultGateway({
      vault: {
        getAbstractFileByPath: () => file,
        cachedRead: () => Promise.resolve("# Title\nBody"),
      },
      metadataCache: {
        getFileCache: () => null,
      },
    } as never);

    await expect(gateway.readMarkdownFile("notes/example.md")).resolves.toMatchObject({
      tags: [],
    });
  });

  it("lists vault folders as a tree without exposing the root folder", async () => {
    const FolderCtor = TFolder as unknown as new (path: string, children?: Array<TFolder | TFile>) => TFolder;
    const FileCtor = TFile as unknown as new (path: string) => TFile;
    const gateway = new ObsidianVaultGateway({
      vault: {
        getRoot: () =>
          new FolderCtor("", [
            new FolderCtor("notes", [new FolderCtor("notes/sub", []), new FileCtor("notes/example.md")]),
            new FolderCtor("empty", []),
            new FileCtor("top.md"),
          ]),
      },
    } as never);

    await expect(gateway.listFolderTree()).resolves.toEqual([
      {
        path: "notes",
        name: "notes",
        children: [
          {
            path: "notes/sub",
            name: "sub",
            children: [],
          },
        ],
      },
      {
        path: "empty",
        name: "empty",
        children: [],
      },
    ]);
  });

  it("writes markdown files through vault.process when the expected content still matches", async () => {
    const FileCtor = TFile as unknown as new (path: string) => TFile;
    const file = new FileCtor("notes/example.md");
    let processedFile: TFile | undefined;
    let writtenContent: string | undefined;
    const gateway = new ObsidianVaultGateway({
      vault: {
        getAbstractFileByPath: () => file,
        process: (targetFile: TFile, updater: (data: string) => string) => {
          processedFile = targetFile;
          writtenContent = updater("# Title\nBody");
          return Promise.resolve(writtenContent);
        },
      },
    } as never);

    await gateway.replaceMarkdownFile("notes/example.md", "# Title\nBody", "# Title\nUpdated");

    expect(processedFile).toBe(file);
    expect(writtenContent).toBe("# Title\nUpdated");
  });

  it("throws a write conflict when vault.process sees changed content", async () => {
    const FileCtor = TFile as unknown as new (path: string) => TFile;
    const file = new FileCtor("notes/example.md");
    const gateway = new ObsidianVaultGateway({
      vault: {
        getAbstractFileByPath: () => file,
        process: (_targetFile: TFile, updater: (data: string) => string) => Promise.resolve(updater("# Title\nChanged")),
      },
    } as never);

    await expect(gateway.replaceMarkdownFile("notes/example.md", "# Title\nBody", "# Title\nUpdated"))
      .rejects.toBeInstanceOf(MarkdownWriteConflictError);
  });

  it("throws when replacing a markdown file that does not exist", async () => {
    const gateway = new ObsidianVaultGateway({
      vault: {
        getAbstractFileByPath: () => null,
      },
    } as never);

    await expect(gateway.replaceMarkdownFile("notes/missing.md", "before", "after"))
      .rejects.toBeInstanceOf(MarkdownFileNotFoundError);
  });

  it("normalizes trailing heading tags when creating backlinks", () => {
    const gateway = new ObsidianVaultGateway({
      vault: {
        getName: () => "Vault",
      },
    } as never);

    expect(
      gateway.createBacklink({
        filePath: "notes/example.md",
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 4,
        headingText: "什么的会人？ #3地区",
      }),
    ).toBe("obsidian://open?vault=Vault&file=notes%2Fexample.md%23%E4%BB%80%E4%B9%88%E7%9A%84%E4%BC%9A%E4%BA%BA%EF%BC%9F%203%E5%9C%B0%E5%8C%BA");
  });

  it("normalizes contiguous trailing heading tags but leaves inline hashes unchanged", () => {
    const gateway = new ObsidianVaultGateway({
      vault: {
        getName: () => "Vault",
      },
    } as never);

    expect(
      gateway.createBacklink({
        filePath: "notes/example.md",
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 4,
        headingText: "什么#会人？ #3地区 #填空题",
      }),
    ).toBe(
      "obsidian://open?vault=Vault&file=notes%2Fexample.md%23%E4%BB%80%E4%B9%88%23%E4%BC%9A%E4%BA%BA%EF%BC%9F%203%E5%9C%B0%E5%8C%BA%20%E5%A1%AB%E7%A9%BA%E9%A2%98",
    );
  });

  it("leaves headings without trailing tags unchanged when creating backlinks", () => {
    const gateway = new ObsidianVaultGateway({
      vault: {
        getName: () => "Vault",
      },
    } as never);

    expect(
      gateway.createBacklink({
        filePath: "notes/example.md",
        headingLine: 1,
        blockStartLine: 1,
        bodyStartLine: 2,
        blockEndLine: 3,
        contentEndLine: 2,
        headingLevel: 4,
        headingText: "佬拓[[卡片试验]]",
      }),
    ).toBe(
      "obsidian://open?vault=Vault&file=notes%2Fexample.md%23%E4%BD%AC%E6%8B%93%5B%5B%E5%8D%A1%E7%89%87%E8%AF%95%E9%AA%8C%5D%5D",
    );
  });

  it("normalizes tag tokens by removing hashes, converting nesting, filtering empties, and deduplicating", () => {
    expect(normalizeObsidianTags([
      "#3地区",
      "#📖/一人公司",
      "#a/b/c",
      "#a//b/",
      "#3地区",
      "#",
      "",
    ])).toEqual([
      "3地区",
      "📖::一人公司",
      "a::b::c",
      "a::b",
    ]);
  });
});
