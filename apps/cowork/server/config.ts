import { join, resolve } from "node:path";
import type { StorageMode } from "./storage";
import { resolveStateDir } from "./storage/statePaths";

export interface CoworkServerConfig {
  port: number;
  corsOrigin: string;
  storage: StorageMode;
  runtimePersistence: CoworkRuntimePersistenceConfig;
}

export interface CoworkRuntimePersistenceConfig {
  toolCachePath: string;
  checkpointDir: string;
}

function parseStorageMode(value?: string): StorageMode {
  if (value === "sqlite" || value === "d1") {
    return value;
  }
  return "json";
}

function resolveRuntimePersistence(): CoworkRuntimePersistenceConfig {
  const stateDir = resolveStateDir();
  const runtimeRoot = process.env.COWORK_RUNTIME_STATE_DIR
    ? resolve(process.env.COWORK_RUNTIME_STATE_DIR)
    : join(stateDir, "runtime");
  const toolCachePath = process.env.COWORK_TOOL_CACHE_PATH
    ? resolve(process.env.COWORK_TOOL_CACHE_PATH)
    : join(runtimeRoot, "tool-cache.msgpack");
  const checkpointDir = process.env.COWORK_CHECKPOINT_DIR
    ? resolve(process.env.COWORK_CHECKPOINT_DIR)
    : join(runtimeRoot, "checkpoints");

  return {
    toolCachePath,
    checkpointDir,
  };
}

export const serverConfig: CoworkServerConfig = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.COWORK_CORS_ORIGIN ?? "*",
  storage: parseStorageMode(process.env.COWORK_STORAGE),
  runtimePersistence: resolveRuntimePersistence(),
};
