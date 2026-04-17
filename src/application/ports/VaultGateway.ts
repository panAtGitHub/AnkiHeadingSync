import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { RenderResourceResolver } from "@/domain/card/ports/RenderResourceResolver";

export interface VaultGateway extends RenderResourceResolver {
  listMarkdownFiles(): Promise<SourceFile[]>;
  getMarkdownFile(path: string): Promise<SourceFile | null>;
  replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void>;
}