import type { StorageMode } from "./storage";

export interface CoworkServerConfig {
  port: number;
  corsOrigin: string;
  storage: StorageMode;
}

function parseStorageMode(value?: string): StorageMode {
  return value === "sqlite" ? "sqlite" : "json";
}

export const serverConfig: CoworkServerConfig = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.COWORK_CORS_ORIGIN ?? "*",
  storage: parseStorageMode(process.env.COWORK_STORAGE),
};
