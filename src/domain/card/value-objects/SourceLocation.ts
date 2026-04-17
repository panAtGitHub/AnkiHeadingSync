export interface SourceLocation {
  filePath: string;
  sourceContent?: string;
  headingLine: number;
  blockStartLine: number;
  bodyStartLine: number;
  blockEndLine: number;
  contentEndLine: number;
  markerLine?: number;
  headingLevel: number;
  headingText: string;
}