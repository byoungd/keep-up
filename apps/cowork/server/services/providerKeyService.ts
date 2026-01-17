import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveProviderFromEnv } from "@ku0/ai-core";
import type { ConfigStoreLike } from "../storage/contracts";
import { ensureStateDir } from "../storage/statePaths";
import type {
  CoworkProviderId,
  CoworkSettings,
  ProviderKeyMap,
  ProviderKeyRecord,
} from "../storage/types";

type Logger = Pick<Console, "warn">;

const KEY_ENV_VAR = "COWORK_PROVIDER_KEY";
const KEY_FILE_NAME = "provider_keys.key";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_PREFIX = "v1:";
const CIPHER_ALGORITHM = "aes-256-gcm";

const PROVIDER_IDS: CoworkProviderId[] = ["openai", "anthropic", "gemini", "ollama", "deepseek"];
const PROVIDER_ENV_MAP: Record<
  CoworkProviderId,
  "openai" | "claude" | "gemini" | "ollama" | "deepseek"
> = {
  openai: "openai",
  anthropic: "claude",
  gemini: "gemini",
  ollama: "ollama",
  deepseek: "deepseek",
};

export type ProviderKeyStatus = {
  providerId: CoworkProviderId;
  hasKey: boolean;
  source: "settings" | "env" | "none";
  lastValidatedAt?: number;
};

export class ProviderKeyService {
  private readonly config: ConfigStoreLike;
  private readonly logger: Logger;
  private keyPromise?: Promise<Buffer>;

  constructor(config: ConfigStoreLike, logger?: Logger) {
    this.config = config;
    this.logger = logger ?? console;
  }

  async getStatus(providerId: CoworkProviderId): Promise<ProviderKeyStatus> {
    const settings = await this.loadSettings();
    const record = settings.providerKeys?.[providerId];
    if (record?.encryptedKey) {
      return {
        providerId,
        hasKey: true,
        source: "settings",
        lastValidatedAt: record.lastValidatedAt,
      };
    }

    const envKey = resolveEnvKey(providerId);
    if (envKey) {
      return {
        providerId,
        hasKey: true,
        source: "env",
      };
    }

    return { providerId, hasKey: false, source: "none" };
  }

  async listStatuses(): Promise<ProviderKeyStatus[]> {
    const statuses: ProviderKeyStatus[] = [];
    for (const providerId of PROVIDER_IDS) {
      statuses.push(await this.getStatus(providerId));
    }
    return statuses;
  }

  async getResolvedKey(providerId: CoworkProviderId): Promise<string | null> {
    const settings = await this.loadSettings();
    const record = settings.providerKeys?.[providerId];
    if (record?.encryptedKey) {
      return this.decrypt(record.encryptedKey);
    }

    const envKey = resolveEnvKey(providerId);
    return envKey ?? null;
  }

  async setKey(providerId: CoworkProviderId, plaintext: string): Promise<ProviderKeyRecord> {
    const trimmed = plaintext.trim();
    if (!trimmed) {
      throw new Error("API key is required");
    }

    const settings = await this.loadSettings();
    const providerKeys = normalizeProviderKeys(settings.providerKeys);
    const existing = providerKeys[providerId];
    const encryptedKey = await this.encrypt(trimmed);
    const now = Date.now();
    const record: ProviderKeyRecord = {
      providerId,
      encryptedKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastValidatedAt: now,
    };

    providerKeys[providerId] = record;
    const next = stripLegacyKeys({
      ...settings,
      providerKeys,
    });
    await this.config.set(next);
    return record;
  }

  async deleteKey(providerId: CoworkProviderId): Promise<boolean> {
    const settings = await this.loadSettings();
    const providerKeys = normalizeProviderKeys(settings.providerKeys);
    if (!providerKeys[providerId]) {
      return false;
    }
    delete providerKeys[providerId];
    const next = stripLegacyKeys({
      ...settings,
      providerKeys,
    });
    await this.config.set(next);
    return true;
  }

  private async loadSettings(): Promise<CoworkSettings> {
    const current = await this.config.get();
    return await this.migrateLegacyKeys(current);
  }

  private async migrateLegacyKeys(settings: CoworkSettings): Promise<CoworkSettings> {
    const legacyEntries: Array<{ providerId: CoworkProviderId; key: string }> = [];
    if (settings.openAiKey) {
      legacyEntries.push({ providerId: "openai", key: settings.openAiKey });
    }
    if (settings.anthropicKey) {
      legacyEntries.push({ providerId: "anthropic", key: settings.anthropicKey });
    }
    if (settings.geminiKey) {
      legacyEntries.push({ providerId: "gemini", key: settings.geminiKey });
    }

    if (legacyEntries.length === 0) {
      return settings;
    }

    const providerKeys = normalizeProviderKeys(settings.providerKeys);
    let didChange = false;
    for (const entry of legacyEntries) {
      if (providerKeys[entry.providerId]) {
        continue;
      }
      providerKeys[entry.providerId] = {
        providerId: entry.providerId,
        encryptedKey: await this.encrypt(entry.key),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastValidatedAt: Date.now(),
      };
      didChange = true;
    }

    if (!didChange) {
      const stripped = stripLegacyKeys(settings);
      if (stripped !== settings) {
        await this.config.set(stripped);
      }
      return stripped;
    }

    const next = stripLegacyKeys({
      ...settings,
      providerKeys,
    });
    await this.config.set(next);
    return next;
  }

  private async encrypt(plaintext: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
    return `${ENVELOPE_PREFIX}${payload}`;
  }

  private async decrypt(payload: string): Promise<string | null> {
    if (!payload.startsWith(ENVELOPE_PREFIX)) {
      return payload;
    }
    const encoded = payload.slice(ENVELOPE_PREFIX.length);
    const raw = Buffer.from(encoded, "base64");
    if (raw.length <= IV_BYTES + TAG_BYTES) {
      this.logger.warn("Encrypted provider key payload is malformed");
      return null;
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    try {
      const key = await this.getEncryptionKey();
      const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString("utf8");
    } catch (error) {
      this.logger.warn("Failed to decrypt provider key", error);
      return null;
    }
  }

  private async getEncryptionKey(): Promise<Buffer> {
    if (!this.keyPromise) {
      this.keyPromise = this.resolveEncryptionKey();
    }
    return this.keyPromise;
  }

  private async resolveEncryptionKey(): Promise<Buffer> {
    const envKey = process.env[KEY_ENV_VAR];
    if (envKey?.trim()) {
      return createHash("sha256").update(envKey.trim()).digest();
    }

    try {
      const stateDir = await ensureStateDir();
      const keyPath = join(stateDir, KEY_FILE_NAME);
      if (existsSync(keyPath)) {
        const stored = (await readFile(keyPath, "utf-8")).trim();
        const decoded = Buffer.from(stored, "base64");
        if (decoded.length === KEY_BYTES) {
          return decoded;
        }
      }

      const generated = randomBytes(KEY_BYTES);
      await writeFile(keyPath, generated.toString("base64"), { mode: 0o600 });
      return generated;
    } catch (error) {
      this.logger.warn("Falling back to ephemeral provider key encryption", error);
      return randomBytes(KEY_BYTES);
    }
  }
}

export function isCoworkProviderId(value: string): value is CoworkProviderId {
  return PROVIDER_IDS.includes(value as CoworkProviderId);
}

export function getCoworkProviderIds(): CoworkProviderId[] {
  return [...PROVIDER_IDS];
}

export function resolveEnvKey(providerId: CoworkProviderId): string | undefined {
  const envProviderId = PROVIDER_ENV_MAP[providerId];
  const env = resolveProviderFromEnv(envProviderId);
  return env?.apiKeys[0];
}

function normalizeProviderKeys(value: unknown): ProviderKeyMap {
  if (!isRecord(value)) {
    return {};
  }
  const next: ProviderKeyMap = {};
  for (const providerId of PROVIDER_IDS) {
    const record = value[providerId];
    if (!isRecord(record) || typeof record.encryptedKey !== "string") {
      continue;
    }
    next[providerId] = {
      providerId,
      encryptedKey: record.encryptedKey,
      createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      lastValidatedAt:
        typeof record.lastValidatedAt === "number" ? record.lastValidatedAt : undefined,
    };
  }
  return next;
}

function stripLegacyKeys(settings: CoworkSettings): CoworkSettings {
  const next = { ...settings };
  if ("openAiKey" in next) {
    delete next.openAiKey;
  }
  if ("anthropicKey" in next) {
    delete next.anthropicKey;
  }
  if ("geminiKey" in next) {
    delete next.geminiKey;
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
