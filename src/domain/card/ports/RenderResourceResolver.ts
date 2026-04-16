import type { SourceLocation } from "../value-objects/SourceLocation";

export interface ResolvedWikiLink {
  url: string;
  displayText: string;
}

export interface ResolvedEmbed {
  kind: "image" | "audio";
  fileName: string;
  absolutePath: string;
  altText?: string;
}

export interface RenderResourceResolver {
  resolveWikiLink(rawTarget: string, sourcePath: string): ResolvedWikiLink | null;
  resolveEmbed(rawTarget: string, sourcePath: string): ResolvedEmbed | null;
  createBacklink(location: SourceLocation): string;
}