import type { NativeSandboxPolicy } from "../native";

export const STRICT_POLICY: NativeSandboxPolicy = {
  version: "1.0",
  name: "strict",
  filesystem: {
    mode: "strict",
    allowedPaths: ["./"],
    blockedPaths: ["~/.ssh", "~/.aws", "/etc", "/System"],
    allowSymlinks: false,
    allowHiddenFiles: false,
  },
  network: {
    enabled: false,
    allowLocalhost: false,
    allowHttps: false,
    allowHttp: false,
  },
  commands: {
    mode: "whitelist",
    allowedCommands: ["git status", "git diff", "npm test", "pnpm test"],
    allowSudo: false,
  },
  limits: {
    maxFileSize: 10 * 1024 * 1024,
    maxExecutionTime: 30000,
  },
};

export const WORKSPACE_POLICY: NativeSandboxPolicy = {
  version: "1.0",
  name: "workspace",
  filesystem: {
    mode: "workspace",
    allowedPaths: ["./"],
    blockedPaths: ["~/.ssh", "~/.aws"],
    allowSymlinks: true,
    allowHiddenFiles: true,
  },
  network: {
    enabled: true,
    allowedDomains: ["registry.npmjs.org", "github.com"],
    allowLocalhost: true,
    allowHttps: true,
    allowHttp: false,
  },
  commands: {
    mode: "blacklist",
    blockedCommands: ["sudo", "rm -rf /", "dd", "mkfs"],
    allowSudo: false,
  },
  limits: {
    maxFileSize: 50 * 1024 * 1024,
    maxExecutionTime: 300000,
  },
};
