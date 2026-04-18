import type { ScopeMode } from "@/application/config/PluginSettings";

export class ScanScopeService {
  filter<T extends { path: string }>(files: T[], scopeMode: ScopeMode, includeFolders: string[], excludeFolders: string[]): T[] {
    const normalizedIncludes = normalizeFolderList(includeFolders);
    const normalizedExcludes = normalizeFolderList(excludeFolders);

    return files.filter((file) => {
      if (!file.path.toLowerCase().endsWith(".md")) {
        return false;
      }

      return this.isPathInScope(file.path, scopeMode, normalizedIncludes, normalizedExcludes);
    });
  }

  isPathInScope(filePath: string, scopeMode: ScopeMode, includeFolders: string[], excludeFolders: string[]): boolean {
    const normalizedPath = normalizeFilePath(filePath);
    const normalizedIncludes = normalizeFolderList(includeFolders);
    const normalizedExcludes = normalizeFolderList(excludeFolders);

    if (scopeMode === "include") {
      return normalizedIncludes.some((folder) => isPathInsideFolder(normalizedPath, folder));
    }

    if (scopeMode === "exclude") {
      return !normalizedExcludes.some((folder) => isPathInsideFolder(normalizedPath, folder));
    }

    return true;
  }
}

function normalizeFolderList(folderPaths: string[]): string[] {
  return folderPaths.map(normalizeFolderPath).filter(Boolean);
}

function normalizeFolderPath(folderPath: string): string {
  return folderPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeFilePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathInsideFolder(filePath: string, folderPath: string): boolean {
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}