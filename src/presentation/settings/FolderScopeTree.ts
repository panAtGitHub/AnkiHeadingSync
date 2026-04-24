import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";

export interface FolderTreeSelectionNode extends FolderTreeNode {
  checked: boolean;
  indeterminate: boolean;
  children: FolderTreeSelectionNode[];
}

export function buildFolderTreeSelection(nodes: FolderTreeNode[], selectedPaths: string[]): FolderTreeSelectionNode[] {
  const explicitSelections = new Set(normalizeSelections(selectedPaths));
  return nodes.map((node) => buildSelectionNode(node, explicitSelections, false));
}

export function toggleFolderTreeSelection(
  nodes: FolderTreeNode[],
  selectedPaths: string[],
  targetPath: string,
  checked: boolean,
): string[] {
  const index = buildTreeIndex(nodes);
  const explicitSelections = new Set(normalizeSelections(selectedPaths).filter((path) => index.nodeByPath.has(path)));

  if (!index.nodeByPath.has(targetPath)) {
    return compressFolderSelections(nodes, Array.from(explicitSelections));
  }

  if (checked) {
    if (findNearestSelectedAncestor(targetPath, explicitSelections, index.parentByPath)) {
      return compressFolderSelections(nodes, Array.from(explicitSelections));
    }

    removeSubtreeSelections(explicitSelections, targetPath);
    explicitSelections.add(targetPath);
    return compressFolderSelections(nodes, Array.from(explicitSelections));
  }

  const nearestSelectedAncestor = findNearestSelectedAncestor(targetPath, explicitSelections, index.parentByPath);
  if (nearestSelectedAncestor) {
    explicitSelections.delete(nearestSelectedAncestor);

    if (nearestSelectedAncestor !== targetPath) {
      const ancestorNode = index.nodeByPath.get(nearestSelectedAncestor);
      if (ancestorNode) {
        for (const replacement of selectAllExceptSubtree(ancestorNode, targetPath)) {
          explicitSelections.add(replacement);
        }
      }
    }
  }

  removeSubtreeSelections(explicitSelections, targetPath);
  return compressFolderSelections(nodes, Array.from(explicitSelections));
}

export function compressFolderSelections(nodes: FolderTreeNode[], selectedPaths: string[]): string[] {
  const explicitSelections = new Set(normalizeSelections(selectedPaths));
  return nodes.flatMap((node) => compressSelectionNode(node, explicitSelections).paths);
}

function buildSelectionNode(
  node: FolderTreeNode,
  explicitSelections: Set<string>,
  ancestorSelected: boolean,
): FolderTreeSelectionNode {
  const selfSelected = ancestorSelected || explicitSelections.has(node.path);
  const children = node.children.map((child) => buildSelectionNode(child, explicitSelections, selfSelected));

  if (selfSelected) {
    return {
      ...node,
      checked: true,
      indeterminate: false,
      children,
    };
  }

  const someChildrenChecked = children.some((child) => child.checked || child.indeterminate);

  return {
    ...node,
    checked: false,
    indeterminate: someChildrenChecked,
    children,
  };
}

function compressSelectionNode(
  node: FolderTreeNode,
  explicitSelections: Set<string>,
): { paths: string[] } {
  if (explicitSelections.has(node.path)) {
    return {
      paths: [node.path],
    };
  }

  if (node.children.length === 0) {
    return {
      paths: [],
    };
  }

  const childResults = node.children.map((child) => compressSelectionNode(child, explicitSelections));

  return {
    paths: childResults.flatMap((child) => child.paths),
  };
}

function buildTreeIndex(nodes: FolderTreeNode[]): {
  nodeByPath: Map<string, FolderTreeNode>;
  parentByPath: Map<string, string | undefined>;
} {
  const nodeByPath = new Map<string, FolderTreeNode>();
  const parentByPath = new Map<string, string | undefined>();

  const visit = (node: FolderTreeNode, parentPath: string | undefined): void => {
    nodeByPath.set(node.path, node);
    parentByPath.set(node.path, parentPath);

    for (const child of node.children) {
      visit(child, node.path);
    }
  };

  for (const node of nodes) {
    visit(node, undefined);
  }

  return {
    nodeByPath,
    parentByPath,
  };
}

function findNearestSelectedAncestor(
  targetPath: string,
  explicitSelections: Set<string>,
  parentByPath: Map<string, string | undefined>,
): string | undefined {
  let currentPath: string | undefined = targetPath;

  while (currentPath) {
    if (explicitSelections.has(currentPath)) {
      return currentPath;
    }

    currentPath = parentByPath.get(currentPath);
  }

  return undefined;
}

function removeSubtreeSelections(explicitSelections: Set<string>, targetPath: string): void {
  for (const path of Array.from(explicitSelections)) {
    if (path === targetPath || isPathInsideFolder(path, targetPath)) {
      explicitSelections.delete(path);
    }
  }
}

function selectAllExceptSubtree(node: FolderTreeNode, targetPath: string): string[] {
  if (node.path === targetPath) {
    return [];
  }

  const targetChild = node.children.find((child) => child.path === targetPath || isPathInsideFolder(targetPath, child.path));
  if (!targetChild) {
    return [node.path];
  }

  const selections: string[] = [];
  for (const child of node.children) {
    if (child.path === targetChild.path) {
      selections.push(...selectAllExceptSubtree(child, targetPath));
      continue;
    }

    selections.push(child.path);
  }

  return selections;
}

function normalizeSelections(selectedPaths: string[]): string[] {
  return Array.from(new Set(selectedPaths.map((path) => normalizePath(path)).filter(Boolean)));
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function isPathInsideFolder(filePath: string, folderPath: string): boolean {
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}
