import { TFile, TFolder, getAllTags } from "obsidian";
import type { App, CachedMetadata } from "obsidian";

import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { MarkdownFileReference, ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import { MarkdownFileNotFoundError, MarkdownWriteConflictError, type VaultGateway } from "@/application/ports/VaultGateway";
import { hashString } from "@/domain/shared/hash";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";

import { normalizeObsidianTags } from "./normalizeObsidianTags";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "tiff"]);
const AUDIO_EXTENSIONS = new Set(["wav", "m4a", "flac", "mp3", "wma", "aac", "webm", "ogg"]);

export class ObsidianVaultGateway implements VaultGateway, ManualSyncVaultGateway {
  constructor(private readonly app: App) {}

  async listFolderTree(): Promise<FolderTreeNode[]> {
    return this.app.vault
      .getRoot()
      .children.filter((child): child is TFolder => child instanceof TFolder)
      .map((folder) => this.toFolderTreeNode(folder));
  }

  async listMarkdownFileRefs(): Promise<MarkdownFileReference[]> {
    return this.app.vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      basename: file.basename,
      mtime: file.stat.mtime,
      size: file.stat.size,
    }));
  }

  async listMarkdownFiles() {
    const files = this.app.vault.getMarkdownFiles();

    return Promise.all(files.map((file) => this.toSourceFile(file)));
  }

  async getMarkdownFile(path: string) {
    const abstractFile = this.app.vault.getAbstractFileByPath(path);

    if (!(abstractFile instanceof TFile) || abstractFile.extension.toLowerCase() !== "md") {
      return null;
    }

    return this.toSourceFile(abstractFile);
  }

  async readMarkdownFile(path: string) {
    return this.getMarkdownFile(path);
  }

  async replaceMarkdownFile(path: string, expectedContent: string, nextContent: string) {
    const abstractFile = this.app.vault.getAbstractFileByPath(path);

    if (!(abstractFile instanceof TFile) || abstractFile.extension.toLowerCase() !== "md") {
      throw new MarkdownFileNotFoundError(path);
    }

    await this.app.vault.process(abstractFile, (currentContent) => {
      if (currentContent !== expectedContent) {
        throw new MarkdownWriteConflictError(path);
      }

      return nextContent;
    });
  }

  resolveWikiLink(rawTarget: string, sourcePath: string) {
    const { alias, linkPath } = parseLinkTarget(rawTarget);
    const destination = this.app.metadataCache.getFirstLinkpathDest(stripSubpath(linkPath), sourcePath);
    const resolvedPath = destination?.path ?? stripSubpath(linkPath);
    const displayText = alias || deriveDisplayText(linkPath);

    return {
      url: this.createObsidianUrl(linkPath.includes("#") ? `${resolvedPath}${linkPath.slice(linkPath.indexOf("#"))}` : resolvedPath),
      displayText,
    };
  }

  resolveEmbed(rawTarget: string, sourcePath: string) {
    const { alias, linkPath } = parseLinkTarget(rawTarget);
    const destination = this.app.metadataCache.getFirstLinkpathDest(stripSubpath(linkPath), sourcePath);

    if (!(destination instanceof TFile)) {
      return null;
    }

    const extension = destination.extension.toLowerCase();
    const kind: "image" | "audio" | null = IMAGE_EXTENSIONS.has(extension)
      ? "image"
      : AUDIO_EXTENSIONS.has(extension)
        ? "audio"
        : null;
    if (!kind) {
      return null;
    }

    const absolutePath = getFullPath(this.app, destination.path);
    const hashedFileName = `${hashString(destination.path)}-${destination.name}`;

    return {
      kind,
      fileName: hashedFileName,
      absolutePath,
      altText: alias || destination.name,
    };
  }

  createBacklink(location: SourceLocation): string {
    return this.createObsidianUrl(`${location.filePath}#${normalizeHeadingForBacklink(location.headingText)}`);
  }

  private async toSourceFile(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);

    return {
      path: file.path,
      basename: file.basename,
      content: await this.app.vault.cachedRead(file),
      tags: extractSourceFileTags(cache),
    };
  }

  private createObsidianUrl(target: string): string {
    return `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(target)}`;
  }

  private toFolderTreeNode(folder: TFolder): FolderTreeNode {
    return {
      path: folder.path,
      name: folder.name,
      children: folder.children.filter((child): child is TFolder => child instanceof TFolder).map((child) => this.toFolderTreeNode(child)),
    };
  }
}

function parseLinkTarget(rawTarget: string): { alias?: string; linkPath: string } {
  const [linkPath, alias] = rawTarget.split("|", 2).map((segment) => segment.trim());

  return {
    linkPath,
    alias: alias || undefined,
  };
}

function stripSubpath(linkPath: string): string {
  return linkPath.split("#", 1)[0];
}

function deriveDisplayText(linkPath: string): string {
  const withoutSubpath = stripSubpath(linkPath);
  const lastSegment = withoutSubpath.split("/").pop() ?? withoutSubpath;
  return lastSegment.replace(/\.[^.]+$/, "") || linkPath;
}

function getFullPath(app: App, vaultPath: string): string {
  const adapter = app.vault.adapter as { getFullPath?: (normalizedPath: string) => string };

  if (!adapter.getFullPath) {
    throw new Error("The active vault adapter does not expose an absolute filesystem path.");
  }

  return adapter.getFullPath(vaultPath);
}

function normalizeHeadingForBacklink(headingText: string): string {
  return headingText.replace(/(?:\s+#\S+)+$/g, (trailingTags) => trailingTags.replace(/(^|\s)#(\S+)/g, "$1$2"));
}

function extractSourceFileTags(cache: CachedMetadata | null | undefined): string[] {
  if (!cache) {
    return [];
  }

  return normalizeObsidianTags(getAllTags(cache));
}
