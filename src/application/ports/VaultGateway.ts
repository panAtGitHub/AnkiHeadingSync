import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { RenderResourceResolver } from "@/domain/card/ports/RenderResourceResolver";

export class MarkdownWriteConflictError extends Error {
  constructor(path: string) {
    super(`Markdown file changed before AHS write-back: ${path}`);
    this.name = "MarkdownWriteConflictError";
  }
}

export class MarkdownFileNotFoundError extends Error {
  constructor(path: string) {
    super(`Markdown file not found: ${path}`);
    this.name = "MarkdownFileNotFoundError";
  }
}

export interface VaultGateway extends RenderResourceResolver {
  listMarkdownFiles(): Promise<SourceFile[]>;
  getMarkdownFile(path: string): Promise<SourceFile | null>;
  replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void>;
}