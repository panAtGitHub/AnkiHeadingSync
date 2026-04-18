import { describe, expect, it } from "vitest";

import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";

import { buildFolderTreeSelection, compressFolderSelections, toggleFolderTreeSelection } from "./FolderScopeTree";

const TREE: FolderTreeNode[] = [
  {
    path: "notes",
    name: "notes",
    children: [
      {
        path: "notes/daily",
        name: "daily",
        children: [],
      },
      {
        path: "notes/projects",
        name: "projects",
        children: [],
      },
    ],
  },
  {
    path: "archive",
    name: "archive",
    children: [],
  },
];

describe("FolderScopeTree", () => {
  it("selecting a parent folder saves the minimal parent-only selection", () => {
    expect(toggleFolderTreeSelection(TREE, [], "notes", true)).toEqual(["notes"]);
  });

  it("clearing a selected parent folder removes all descendants", () => {
    expect(toggleFolderTreeSelection(TREE, ["notes"], "notes", false)).toEqual([]);
  });

  it("marks a parent as indeterminate when only part of its children are selected", () => {
    const selection = buildFolderTreeSelection(TREE, ["notes/daily"]);

    expect(selection[0]).toMatchObject({
      path: "notes",
      checked: false,
      indeterminate: true,
    });
    expect(selection[0]?.children[0]).toMatchObject({
      path: "notes/daily",
      checked: true,
      indeterminate: false,
    });
  });

  it("expands a selected parent when one child subtree is unchecked", () => {
    expect(toggleFolderTreeSelection(TREE, ["notes"], "notes/daily", false)).toEqual(["notes/projects"]);
  });

  it("compresses fully selected sibling folders back to their parent", () => {
    expect(compressFolderSelections(TREE, ["notes/daily", "notes/projects"])).toEqual(["notes"]);
  });
});