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

const SINGLE_CHILD_TREE: FolderTreeNode[] = [
  {
    path: "9Anki背诵",
    name: "9Anki背诵",
    children: [
      {
        path: "9Anki背诵/随感",
        name: "随感",
        children: [],
      },
    ],
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

  it("keeps a single selected child explicit and marks its parent indeterminate", () => {
    expect(toggleFolderTreeSelection(SINGLE_CHILD_TREE, [], "9Anki背诵/随感", true)).toEqual(["9Anki背诵/随感"]);

    const selection = buildFolderTreeSelection(SINGLE_CHILD_TREE, ["9Anki背诵/随感"]);

    expect(selection[0]).toMatchObject({
      path: "9Anki背诵",
      checked: false,
      indeterminate: true,
    });
    expect(selection[0]?.children[0]).toMatchObject({
      path: "9Anki背诵/随感",
      checked: true,
      indeterminate: false,
    });
  });

  it("keeps fully selected sibling folders explicit instead of promoting them to the parent", () => {
    expect(compressFolderSelections(TREE, ["notes/daily", "notes/projects"])).toEqual(["notes/daily", "notes/projects"]);

    const selection = buildFolderTreeSelection(TREE, ["notes/daily", "notes/projects"]);

    expect(selection[0]).toMatchObject({
      path: "notes",
      checked: false,
      indeterminate: true,
    });
  });

  it("shows descendants as selected when their parent is explicitly selected", () => {
    const selection = buildFolderTreeSelection(TREE, ["notes"]);

    expect(selection[0]).toMatchObject({
      path: "notes",
      checked: true,
      indeterminate: false,
    });
    expect(selection[0]?.children[0]).toMatchObject({
      path: "notes/daily",
      checked: true,
      indeterminate: false,
    });
    expect(selection[0]?.children[1]).toMatchObject({
      path: "notes/projects",
      checked: true,
      indeterminate: false,
    });
  });

  it("expands a selected parent when one child subtree is unchecked", () => {
    expect(toggleFolderTreeSelection(TREE, ["notes"], "notes/daily", false)).toEqual(["notes/projects"]);
  });
});
