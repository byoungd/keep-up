import { join, resolve } from "node:path";
import type { StorageMode } from "./storage";
import { resolveStateDir } from "./storage/statePaths";

export interface CoworkServerConfig {
  port: number;
  corsOrigin: string;
  storage: StorageMode;
  runtimePersistence: CoworkRuntimePersistenceConfig;
  gatewayControl: CoworkGatewayControlConfig;
  telegram: CoworkTelegramConfig;
  discord: CoworkDiscordConfig;
}

export interface CoworkRuntimePersistenceConfig {
  toolCachePath: string;
  checkpointDir: string;
}

export interface CoworkGatewayControlConfig {
  enabled: boolean;
  port: number;
  nodePort: number;
  auth: CoworkGatewayAuthConfig;
}

export interface CoworkGatewayAuthConfig {
  mode: "none" | "token";
  token?: string;
}

export interface CoworkTelegramConfig {
  enabled: boolean;
  token?: string;
  sessionId?: string;
  pollingIntervalMs?: number;
  longPollTimeoutSeconds?: number;
}

export interface CoworkDiscordConfig {
  enabled: boolean;
  token?: string;
  channelId?: string;
  pollingIntervalMs?: number;
  baseUrl?: string;
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

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const port = Number(process.env.PORT ?? 3000);
const gatewayControlPort = parseNumberEnv(process.env.COWORK_GATEWAY_CONTROL_PORT) ?? port + 1;
const gatewayNodePort =
  parseNumberEnv(process.env.COWORK_GATEWAY_NODE_PORT) ?? gatewayControlPort + 1;
const gatewayAuthToken = process.env.KEEPUP_GATEWAY_TOKEN;
const telegramToken = process.env.COWORK_TELEGRAM_TOKEN;
const discordToken = process.env.COWORK_DISCORD_TOKEN;
const discordChannelId = process.env.COWORK_DISCORD_CHANNEL_ID;

export const serverConfig: CoworkServerConfig = {
  port,
  corsOrigin: process.env.COWORK_CORS_ORIGIN ?? "*",
  storage: parseStorageMode(process.env.COWORK_STORAGE),
  runtimePersistence: resolveRuntimePersistence(),
  gatewayControl: {
    enabled: parseBooleanEnv(process.env.COWORK_GATEWAY_CONTROL_ENABLED, false),
    port: gatewayControlPort,
    nodePort: gatewayNodePort,
    auth: gatewayAuthToken ? { mode: "token", token: gatewayAuthToken } : { mode: "none" },
  },
  telegram: {
    enabled: parseBooleanEnv(process.env.COWORK_TELEGRAM_ENABLED, Boolean(telegramToken)),
    token: telegramToken,
    sessionId: process.env.COWORK_TELEGRAM_SESSION_ID,
    pollingIntervalMs: parseNumberEnv(process.env.COWORK_TELEGRAM_POLL_INTERVAL_MS),
    longPollTimeoutSeconds: parseNumberEnv(process.env.COWORK_TELEGRAM_LONG_POLL_SECONDS),
  },
  discord: {
    enabled: parseBooleanEnv(
      process.env.COWORK_DISCORD_ENABLED,
      Boolean(discordToken && discordChannelId)
    ),
    token: discordToken,
    channelId: discordChannelId,
    pollingIntervalMs: parseNumberEnv(process.env.COWORK_DISCORD_POLL_INTERVAL_MS),
    baseUrl: process.env.COWORK_DISCORD_BASE_URL,
  },
};
