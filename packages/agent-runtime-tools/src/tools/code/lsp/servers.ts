/**
 * Language server configuration and detection helpers.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  filePatterns: string[];
  projectMarkers: string[];
  initializationOptions?: Record<string, unknown>;
}

export interface DetectedLanguageServer {
  config: ServerConfig;
  rootPath: string;
}

const typescriptServerPath = resolveTypeScriptServerPath();

export const LANGUAGE_SERVERS: ServerConfig[] = [
  {
    id: "typescript",
    name: "TypeScript Language Server",
    command: "typescript-language-server",
    args: ["--stdio"],
    filePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx"],
    projectMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    initializationOptions: typescriptServerPath
      ? {
          tsserver: {
            path: typescriptServerPath,
            fallbackPath: typescriptServerPath,
          },
        }
      : undefined,
  },
  {
    id: "go",
    name: "gopls",
    command: "gopls",
    args: ["serve"],
    filePatterns: ["*.go"],
    projectMarkers: ["go.mod"],
  },
  {
    id: "rust",
    name: "rust-analyzer",
    command: "rust-analyzer",
    args: [],
    filePatterns: ["*.rs"],
    projectMarkers: ["Cargo.toml"],
  },
  {
    id: "python",
    name: "pyright",
    command: "pyright-langserver",
    args: ["--stdio"],
    filePatterns: ["*.py"],
    projectMarkers: ["pyproject.toml", "setup.py", "requirements.txt"],
  },
];

function resolveTypeScriptServerPath(): string | null {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("typescript/lib/tsserver.js");
  } catch {
    return null;
  }
}

function isCommandPath(command: string): boolean {
  return (
    command.includes(path.sep) ||
    command.includes("/") ||
    command.includes("\\") ||
    path.isAbsolute(command)
  );
}

function resolveLocalBinary(command: string, startPath: string): string | null {
  const candidates =
    process.platform === "win32"
      ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`]
      : [command];
  let current = path.resolve(startPath);

  while (true) {
    for (const candidate of candidates) {
      const binPath = path.join(current, "node_modules", ".bin", candidate);
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveLanguageServerCommand(config: ServerConfig, rootPath: string): string {
  if (isCommandPath(config.command)) {
    return config.command;
  }

  const resolved =
    resolveLocalBinary(config.command, rootPath) ??
    resolveLocalBinary(config.command, process.cwd());

  return resolved ?? config.command;
}

export function resolveLanguageServerConfig(config: ServerConfig, rootPath: string): ServerConfig {
  const command = resolveLanguageServerCommand(config, rootPath);
  if (command === config.command) {
    return config;
  }
  return { ...config, command };
}

/**
 * Detect the appropriate language server for a project root.
 */
export function detectLanguageServer(rootPath: string): ServerConfig | null {
  const config = detectLanguageServerFromConfigs(rootPath, LANGUAGE_SERVERS);
  if (!config) {
    return null;
  }
  return resolveLanguageServerConfig(config, rootPath);
}

/**
 * Detect a language server and root path for a given file or directory.
 */
export function detectLanguageServerForPath(targetPath: string): DetectedLanguageServer | null {
  const resolvedPath = path.resolve(targetPath);
  const candidateServers = filterServersByPath(resolvedPath, LANGUAGE_SERVERS);
  const startDir = resolveStartDirectory(resolvedPath);
  let current = startDir;

  while (true) {
    const config = detectLanguageServerFromConfigs(current, candidateServers);
    if (config) {
      return { config: resolveLanguageServerConfig(config, current), rootPath: current };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveStartDirectory(resolvedPath: string): string {
  try {
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      return resolvedPath;
    }
  } catch {
    return path.dirname(resolvedPath);
  }
  return path.dirname(resolvedPath);
}

function detectLanguageServerFromConfigs(
  rootPath: string,
  configs: ServerConfig[]
): ServerConfig | null {
  for (const config of configs) {
    for (const marker of config.projectMarkers) {
      if (fs.existsSync(path.join(rootPath, marker))) {
        return config;
      }
    }
  }
  return null;
}

function filterServersByPath(targetPath: string, configs: ServerConfig[]): ServerConfig[] {
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      return configs;
    }
  } catch {
    // Ignore stat errors; fall through to extension matching.
  }
  const extension = path.extname(targetPath).toLowerCase();
  if (!extension) {
    return configs;
  }

  return configs.filter((config) => matchesExtension(extension, config.filePatterns));
}

function matchesExtension(extension: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith("*.")) {
      if (pattern.slice(1).toLowerCase() === extension) {
        return true;
      }
      continue;
    }
    if (pattern.toLowerCase() === extension) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a language server is available on the system.
 */
export async function isServerAvailable(config: ServerConfig): Promise<boolean> {
  if (isCommandPath(config.command)) {
    return fs.existsSync(config.command);
  }

  const checker = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(checker, [config.command]);
    return true;
  } catch {
    return false;
  }
}
