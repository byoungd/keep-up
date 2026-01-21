export type NodeType =
  | "paragraph"
  | "heading"
  | "code_block"
  | "blockquote"
  | "list"
  | "list_item"
  | "task_item"
  | "horizontal_rule"
  | "table"
  | "table_row"
  | "table_cell"
  | "text"
  | "strong"
  | "emphasis"
  | "code"
  | "link"
  | "image"
  | "strikethrough"
  | "hard_break";

export interface ASTNode {
  type: NodeType;
  content?: string;
  children?: ASTNode[];
  attrs?: Record<string, unknown>;
  position?: { start: number; end: number };
}

export interface ParserStateSnapshot {
  inCodeBlock: boolean;
  codeBlockLang: string;
  listStack: Array<{ type: "bullet" | "ordered" | "task"; indent: number }>;
  openMarkers: string[];
  bufferOffset: number;
}

export interface ParseResult {
  nodes: ASTNode[];
  pending: string;
  state: ParserStateSnapshot;
}

export interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
  maxBufferSize?: number;
}

export type CacheStats = { hits: number; misses: number; ratio: number };

export type NativeStreamingMarkdownParser = {
  push: (chunk: string) => ParseResult;
  flush: () => ParseResult;
  reset: () => void;
  getCacheStats: () => CacheStats;
};

export type NativeStreamingMarkdownBinding = {
  StreamingMarkdownParser: new (options?: ParserOptions) => NativeStreamingMarkdownParser;
};
