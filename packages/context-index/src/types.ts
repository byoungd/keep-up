export interface ContextChunk {
  id: string;
  sourcePath: string;
  content: string;
  tokenCount: number;
  embedding: number[];
  updatedAt: number;
}

export interface ContextPack {
  id: string;
  name: string;
  chunkIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ContextSource {
  sourcePath: string;
  contentHash: string;
  tokenCount: number;
  chunkIds: string[];
  updatedAt: number;
}

export interface ContextPackPin {
  sessionId: string;
  packIds: string[];
  updatedAt: number;
}

export interface ContextIndexConfig {
  rootPath: string;
  includeExtensions?: string[];
  excludeDirs?: string[];
  maxFileBytes?: number;
  maxChunkTokens?: number;
  chunkOverlapTokens?: number;
  promptTokenBudget?: number;
  minSearchScore?: number;
  reindexIntervalMs?: number;
}

export interface ContextSearchOptions {
  limit?: number;
  minScore?: number;
}

export interface ContextSearchResult {
  chunk: ContextChunk;
  score: number;
}

export interface ContextIndexReport {
  totalFiles: number;
  updatedFiles: number;
  skippedFiles: number;
  removedFiles: number;
  chunkCount: number;
}

export interface ContextPackPromptOptions {
  tokenBudget?: number;
}

export interface ContextIndexStore {
  listChunks(): Promise<ContextChunk[]>;
  listChunksBySource(sourcePath: string): Promise<ContextChunk[]>;
  getChunk(id: string): Promise<ContextChunk | null>;
  upsertChunk(chunk: ContextChunk): Promise<ContextChunk>;
  deleteChunk(id: string): Promise<boolean>;
  deleteChunksBySource(sourcePath: string): Promise<number>;

  listPacks(): Promise<ContextPack[]>;
  getPack(id: string): Promise<ContextPack | null>;
  upsertPack(pack: ContextPack): Promise<ContextPack>;
  deletePack(id: string): Promise<boolean>;

  listSources(): Promise<ContextSource[]>;
  getSource(sourcePath: string): Promise<ContextSource | null>;
  upsertSource(source: ContextSource): Promise<ContextSource>;
  deleteSource(sourcePath: string): Promise<boolean>;

  listPins(): Promise<ContextPackPin[]>;
  getPins(sessionId: string): Promise<ContextPackPin | null>;
  upsertPins(pins: ContextPackPin): Promise<ContextPackPin>;
  deletePins(sessionId: string): Promise<boolean>;
}
