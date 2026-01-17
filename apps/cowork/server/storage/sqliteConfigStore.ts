/**
 * SQLite-based settings store.
 * Persists Cowork settings in the settings table.
 */

import { getDatabase } from "./database";
import type { CoworkSettings, ProviderKeyMap } from "./types";

export interface SqliteConfigStore {
  get(): Promise<CoworkSettings>;
  set(next: CoworkSettings): Promise<CoworkSettings>;
  update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings>;
}

const ALLOWED_KEYS = new Set<keyof CoworkSettings>([
  "providerKeys",
  "openAiKey",
  "anthropicKey",
  "geminiKey",
  "defaultModel",
  "theme",
]);

function parseSettingValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function applySetting(settings: CoworkSettings, key: string, value: unknown): void {
  if (!ALLOWED_KEYS.has(key as keyof CoworkSettings) || value === undefined) {
    return;
  }

  if (key === "theme") {
    if (value === "light" || value === "dark") {
      settings.theme = value;
    }
    return;
  }

  if (key === "providerKeys") {
    if (isRecord(value)) {
      settings.providerKeys = value as ProviderKeyMap;
    }
    return;
  }

  if (typeof value === "string" && isStringSettingKey(key)) {
    settings[key] = value;
  }
}

export async function createSqliteConfigStore(): Promise<SqliteConfigStore> {
  const db = await getDatabase();

  const selectAllStmt = db.prepare(`
    SELECT key, value FROM settings
  `);

  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value)
    VALUES ($key, $value)
  `);

  async function readAll(): Promise<CoworkSettings> {
    const rows = selectAllStmt.all() as Array<{ key: string; value: string }>;
    const settings: CoworkSettings = {};

    for (const row of rows) {
      const value = parseSettingValue(row.value);
      applySetting(settings, row.key, value);
    }

    return settings;
  }

  const setSettings = async (next: CoworkSettings): Promise<CoworkSettings> => {
    const entries = Object.entries(next);
    for (const [key, value] of entries) {
      if (!ALLOWED_KEYS.has(key as keyof CoworkSettings)) {
        continue;
      }
      upsertStmt.run({ $key: key, $value: JSON.stringify(value ?? "") });
    }
    return next;
  };

  return {
    async get(): Promise<CoworkSettings> {
      return readAll();
    },

    async set(next: CoworkSettings): Promise<CoworkSettings> {
      return setSettings(next);
    },

    async update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings> {
      const current = await readAll();
      const next = updater(current);
      await setSettings(next);
      return next;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringSettingKey(
  key: string
): key is "openAiKey" | "anthropicKey" | "geminiKey" | "defaultModel" {
  return (
    key === "openAiKey" || key === "anthropicKey" || key === "geminiKey" || key === "defaultModel"
  );
}
