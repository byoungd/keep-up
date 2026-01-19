/**
 * Language server configuration and detection helpers.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
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
}

export interface DetectedLanguageServer {
  config: ServerConfig;
  rootPath: string;
}

export const LANGUAGE_SERVERS: ServerConfig[] = [
  {
    id: "typescript",
    name: "TypeScript Language Server",
    command: "typescript-language-server",
    args: ["--stdio"],
    filePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx"],
    projectMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
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

/**
 * Detect the appropriate language server for a project root.
 */
export function detectLanguageServer(rootPath: string): ServerConfig | null {
  return detectLanguageServerFromConfigs(rootPath, LANGUAGE_SERVERS);
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
      return { config, rootPath: current };
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
  const hasPathSeparator =
    config.command.includes(path.sep) ||
    config.command.includes("/") ||
    config.command.includes("\\");
  if (hasPathSeparator || path.isAbsolute(config.command)) {
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
