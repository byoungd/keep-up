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

// Errors
export * from "./errors.js";

// LFCC v0.9 RC Gateway
export * as gateway from "./gateway/index.js";
export type { GatewayTelemetryEvent } from "./gateway/types.js";
// LFCC v0.9 RC Kernel
export * from "./kernel/index.js";
// Observability (Track 12)
export * as observability from "./observability/index.js";
// Persistence (Track 10)
export * as persistence from "./persistence/index.js";
// Security (Track 11)
export * as security from "./security/index.js";
// Sync Protocol
export * from "./sync/index.js";
// Text Normalization
export * from "./text/normalization.js";
