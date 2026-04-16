import type { SourceFile } from "@/domain/card/entities/SourceFile";

export class ScanScopeService {
  filter(files: SourceFile[], includeFolders: string[], excludeFolders: string[]): SourceFile[] {
    const normalizedIncludes = includeFolders.map(normalizeFolderPath).filter(Boolean);
    const normalizedExcludes = excludeFolders.map(normalizeFolderPath).filter(Boolean);

    return files.filter((file) => {
      if (!file.path.toLowerCase().endsWith(".md")) {
        return false;
      }

      const normalizedPath = normalizeFilePath(file.path);
      const included =
        normalizedIncludes.length === 0 || normalizedIncludes.some((folder) => isPathInsideFolder(normalizedPath, folder));
      const excluded = normalizedExcludes.some((folder) => isPathInsideFolder(normalizedPath, folder));

      return included && !excluded;
    });
  }
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