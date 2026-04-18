import { TFile } from "obsidian";
import type { App } from "obsidian";

import { MarkdownFileNotFoundError, MarkdownWriteConflictError, type VaultGateway } from "@/application/ports/VaultGateway";
import { hashString } from "@/domain/shared/hash";
import type { SourceLocation } from "@/domain/card/value-objects/SourceLocation";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "tiff"]);
const AUDIO_EXTENSIONS = new Set(["wav", "m4a", "flac", "mp3", "wma", "aac", "webm", "ogg"]);

export class ObsidianVaultGateway implements VaultGateway {
  constructor(private readonly app: App) {}

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

  async replaceMarkdownFile(path: string, expectedContent: string, nextContent: string) {
    const abstractFile = this.app.vault.getAbstractFileByPath(path);

    if (!(abstractFile instanceof TFile) || abstractFile.extension.toLowerCase() !== "md") {
      throw new MarkdownFileNotFoundError(path);
    }

    const currentContent = await this.app.vault.cachedRead(abstractFile);
    if (currentContent !== expectedContent) {
      throw new MarkdownWriteConflictError(path);
    }

    await this.app.vault.modify(abstractFile, nextContent);
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
    return this.createObsidianUrl(`${location.filePath}#${location.headingText}`);
  }

  private async toSourceFile(file: TFile) {
    return {
      path: file.path,
      basename: file.basename,
      content: await this.app.vault.cachedRead(file),
    };
  }

  private createObsidianUrl(target: string): string {
    return `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(target)}`;
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