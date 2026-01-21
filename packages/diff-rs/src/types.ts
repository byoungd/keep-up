export type DiffLineType = "context" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header?: string;
  lines: DiffLine[];
}
