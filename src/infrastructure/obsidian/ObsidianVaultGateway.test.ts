import { describe, expect, it } from "vitest";
import { TFile, TFolder } from "obsidian";

import { ObsidianVaultGateway } from "./ObsidianVaultGateway";

describe("ObsidianVaultGateway", () => {
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
});