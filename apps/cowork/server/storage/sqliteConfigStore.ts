/**
 * SQLite-based settings store.
 * Persists Cowork settings in the settings table.
 */

import { getDatabase } from "./database";
import type { CoworkSettings } from "./types";

export interface SqliteConfigStore {
  get(): Promise<CoworkSettings>;
  set(next: CoworkSettings): Promise<CoworkSettings>;
  update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings>;
}

const ALLOWED_KEYS = new Set<keyof CoworkSettings>([
  "openAiKey",
  "anthropicKey",
  "defaultModel",
  "theme",
]);

function parseSettingValue(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return raw;
  }
}

function applySetting(settings: CoworkSettings, key: string, value: string | undefined): void {
  if (!ALLOWED_KEYS.has(key as keyof CoworkSettings) || value === undefined) {
    return;
  }

  if (key === "theme") {
    if (value === "light" || value === "dark") {
      settings.theme = value;
    }
    return;
  }

  const settingKey = key as keyof CoworkSettings;
  if (settingKey !== "theme") {
    settings[settingKey] = value;
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
