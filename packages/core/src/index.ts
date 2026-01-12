export type TokenRange = {
  startTokenId: string;
  endTokenId: string;
  quote?: string;
};

export type Block = {
  id: string;
  type: string;
  text?: string;
  children?: Block[];
};

export type Annotation = {
  id: string;
  kind: "highlight" | "comment" | "suggestion" | "custom";
  range: TokenRange;
  createdAtMs: number;
};

export type Doc = {
  id: string;
  title?: string;
  blocks: Block[];
  annotations: Annotation[];
};

// LFCC v0.9 RC Kernel
export * from "./kernel";

// LFCC v0.9 RC Gateway
export * as gateway from "./gateway";

// Text Normalization
export * from "./text/normalization";

// Sync Protocol
export * from "./sync";

// Observability (Track 12)
export * as observability from "./observability";

// Persistence (Track 10)
export * as persistence from "./persistence";

// Security (Track 11)
export * as security from "./security";

// Errors
export * from "./errors";
