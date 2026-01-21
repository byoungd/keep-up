export type SubstringMatch = {
  start: number;
  end: number;
  score: number;
};

export type BlockInput = {
  block_id: string;
  content: string;
};

export type BlockMatch = {
  block_id: string;
  start: number;
  end: number;
  score: number;
};

export type NativeAnchorRelocationBinding = {
  computeTextSimilarity: (a: string, b: string) => number;
  findSubstringMatches: (needle: string, haystack: string) => SubstringMatch[];
  findBlockMatches: (needle: string, blocks: BlockInput[], threshold?: number) => BlockMatch[];
  computeFuzzyContextHash: (prefix: string, suffix: string) => string;
  computeNgramSimilarity: (a: string, b: string, n?: number) => number;
};
