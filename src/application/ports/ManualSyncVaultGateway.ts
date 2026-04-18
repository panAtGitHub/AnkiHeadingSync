import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { RenderResourceResolver } from "@/domain/card/ports/RenderResourceResolver";

export interface MarkdownFileReference {
  path: string;
  basename: string;
  mtime: number;
  size: number;
}

export interface ManualSyncVaultGateway extends RenderResourceResolver {
  listMarkdownFileRefs(): Promise<MarkdownFileReference[]>;
  readMarkdownFile(path: string): Promise<SourceFile | null>;
  replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void>;
}