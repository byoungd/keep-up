import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.COWORK_ENV_PATH,
  resolve(baseDir, "..", ".env.local"),
  resolve(baseDir, "..", ".env"),
];

for (const candidate of candidates) {
  if (!candidate) {
    continue;
  }
  if (existsSync(candidate)) {
    const contents = readFileSync(candidate, "utf8");
    applyEnv(contents);
    break;
  }
}

function applyEnv(contents: string) {
  for (const line of contents.split(/\r?\n/u)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }
    if (process.env[parsed.key] !== undefined) {
      continue;
    }
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const sanitized = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
  const equalsIndex = sanitized.indexOf("=");
  if (equalsIndex === -1) {
    return null;
  }
  const key = sanitized.slice(0, equalsIndex).trim();
  if (!key) {
    return null;
  }
  let value = sanitized.slice(equalsIndex + 1).trim();
  value = stripQuotes(value);
  return { key, value: unescapeNewlines(value) };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function unescapeNewlines(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
}
