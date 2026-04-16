export interface SourceLocation {
  filePath: string;
  headingLine: number;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  headingLevel: number;
  headingText: string;
}