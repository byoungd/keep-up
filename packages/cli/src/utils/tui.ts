import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TUI_BIN_ENV = "KEEPUP_TUI_BIN";
export const TUI_HOST_ENV = "KEEPUP_TUI_HOST";
export const TUI_MODEL_ENV = "KEEPUP_TUI_MODEL";
export const TUI_PROVIDER_ENV = "KEEPUP_TUI_PROVIDER";
export const TUI_SESSION_ENV = "KEEPUP_TUI_SESSION";

export function resolveTuiBinary(): string | undefined {
  const override = process.env[TUI_BIN_ENV];
  if (override && existsSync(override)) {
    return override;
  }

  const suffix = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.resolve(process.cwd(), `packages/keepup-tui/target/release/keepup-tui${suffix}`),
    path.resolve(process.cwd(), `packages/keepup-tui/target/debug/keepup-tui${suffix}`),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

export function resolveTuiHost(): string | undefined {
  const override = process.env[TUI_HOST_ENV];
  if (override && existsSync(override)) {
    return override;
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const hostPath = path.resolve(__dirname, "../tui/host.js");
  return existsSync(hostPath) ? hostPath : undefined;
}
