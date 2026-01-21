import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface NativeStorageEngine {
  saveCheckpoint(id: string, data: Uint8Array): void;
  loadCheckpoint(id: string): Uint8Array | null;
  deleteCheckpoint(id: string): boolean;
  appendEvent(data: Uint8Array): bigint;
  replayEvents(from: bigint, limit?: number): Uint8Array[];
  pruneEvents(before: bigint): bigint;
}

interface NativeBinding {
  StorageEngine: new (rootDir: string) => NativeStorageEngine;
}

const bindingState: { binding: NativeBinding | null; error: Error | null } = {
  binding: null,
  error: null,
};

function loadNativeBinding(): NativeBinding {
  if (bindingState.binding) {
    return bindingState.binding;
  }
  if (bindingState.error) {
    throw bindingState.error;
  }

  const require = createRequire(import.meta.url);
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const override = process.env.KU0_STORAGE_ENGINE_RS_NATIVE_PATH;
  const candidates = [
    override,
    join(baseDir, "storage_engine_rs.node"),
    join(baseDir, "..", "dist", "storage_engine_rs.node"),
    join(baseDir, "native", "storage_engine_rs.node"),
    join(baseDir, "..", "native", "storage_engine_rs.node"),
    join(baseDir, "..", "target", "release", "storage_engine_rs.node"),
    join(baseDir, "..", "target", "debug", "storage_engine_rs.node"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const binding = require(candidate) as NativeBinding;
      bindingState.binding = binding;
      return binding;
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(
    `Native storage engine binding not found. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
  bindingState.error = error;
  throw error;
}

export function isNativeStorageEngineAvailable(): boolean {
  try {
    loadNativeBinding();
    return true;
  } catch {
    return false;
  }
}

export class StorageEngine {
  private readonly engine: NativeStorageEngine;

  constructor(rootDir: string) {
    const binding = loadNativeBinding();
    this.engine = new binding.StorageEngine(rootDir);
  }

  saveCheckpoint(id: string, data: Uint8Array): void {
    this.engine.saveCheckpoint(id, data);
  }

  loadCheckpoint(id: string): Uint8Array | null {
    return this.engine.loadCheckpoint(id);
  }

  deleteCheckpoint(id: string): boolean {
    return this.engine.deleteCheckpoint(id);
  }

  appendEvent(data: Uint8Array): bigint {
    return this.engine.appendEvent(data);
  }

  replayEvents(from: bigint, limit?: number): Uint8Array[] {
    return this.engine.replayEvents(from, limit);
  }

  pruneEvents(before: bigint): bigint {
    return this.engine.pruneEvents(before);
  }
}
