/**
 * Utility functions for session and task metadata
 */

import type { CoworkIsolationLevel, CoworkSandboxMode, CoworkSession } from "@ku0/agent-runtime";

/**
 * Collect output roots from session grants
 */
export function collectOutputRoots(session: CoworkSession): string[] {
  const roots: string[] = [];
  for (const grant of session.grants) {
    if (Array.isArray(grant.outputRoots)) {
      roots.push(...grant.outputRoots);
    }
  }
  return roots;
}

/**
 * Collect artifact roots from session grants
 */
export function collectArtifactRoots(session: CoworkSession): string[] {
  const roots = new Set<string>();
  for (const grant of session.grants) {
    if (typeof grant.rootPath === "string") {
      roots.add(grant.rootPath);
    }
    if (Array.isArray(grant.outputRoots)) {
      for (const root of grant.outputRoots) {
        roots.add(root);
      }
    }
  }
  return Array.from(roots);
}

/**
 * Combine multiple prompt additions into one
 */
export function combinePromptAdditions(...additions: (string | undefined)[]): string | undefined {
  const nonEmpty = additions.filter((a): a is string => typeof a === "string" && a.length > 0);
  if (nonEmpty.length === 0) {
    return undefined;
  }
  return nonEmpty.join("\n\n---\n\n");
}

/**
 * Check if error is an ENOENT errno
 */
export function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

const SESSION_ISOLATION_ENV_KEYS = [
  "COWORK_SESSION_ISOLATION_LEVEL",
  "COWORK_SESSION_ISOLATION",
  "COWORK_ISOLATION_LEVEL",
] as const;

export type SessionIsolationSource = "env" | "default";

export type SessionIsolationStatus = {
  level: CoworkIsolationLevel;
  source: SessionIsolationSource;
  envKey?: (typeof SESSION_ISOLATION_ENV_KEYS)[number];
};

export function resolveDefaultIsolationLevel(): SessionIsolationStatus {
  for (const key of SESSION_ISOLATION_ENV_KEYS) {
    const raw = process.env[key]?.trim().toLowerCase();
    if (raw === "main" || raw === "sandbox" || raw === "restricted") {
      return { level: raw, source: "env", envKey: key };
    }
  }
  return { level: "main", source: "default" };
}

const SESSION_SANDBOX_ENV_KEYS = ["COWORK_SESSION_SANDBOX_MODE", "COWORK_SANDBOX_MODE"] as const;

const DEFAULT_SANDBOX_MODES: Record<CoworkIsolationLevel, CoworkSandboxMode> = {
  main: "none",
  sandbox: "workspace-write",
  restricted: "docker",
};

const SANDBOX_TOOL_ALLOWLIST = [
  "completion:*",
  "clarification:*",
  "message:*",
  "plan:*",
  "task:*",
  "todo:*",
  "scratch:*",
  "delegation:*",
  "subagent:*",
  "skills:*",
  "toolkit:*",
  "file:*",
  "bash:*",
  "code:*",
  "web:*",
  "browser:*",
  "lfcc:*",
];

const RESTRICTED_TOOL_ALLOWLIST = [
  "completion:*",
  "clarification:*",
  "message:*",
  "plan:*",
  "task:*",
  "todo:*",
  "scratch:*",
  "delegation:*",
  "subagent:*",
  "skills:*",
  "toolkit:*",
  "file:read",
  "file:list",
  "file:info",
];

export type SessionSandboxModeSource = "env" | "default";

export type SessionSandboxModeStatus = {
  mode: CoworkSandboxMode;
  source: SessionSandboxModeSource;
  envKey?: (typeof SESSION_SANDBOX_ENV_KEYS)[number];
};

export type SessionIsolationInput = {
  isolationLevel?: CoworkIsolationLevel | null;
  userId?: string | null;
  currentUserId?: string | null;
  workspaceOwnerId?: string | null;
};

export type SessionIsolationConfigInput = SessionIsolationInput & {
  sandboxMode?: CoworkSandboxMode | null;
  toolAllowlist?: string[] | null;
  toolDenylist?: string[] | null;
};

export type SessionIsolationConfig = {
  isolationLevel: CoworkIsolationLevel;
  sandboxMode: CoworkSandboxMode;
  toolAllowlist: string[];
  toolDenylist: string[];
};

export function resolveSessionIsolation(
  input?: SessionIsolationInput | null
): CoworkIsolationLevel {
  if (
    input?.isolationLevel === "main" ||
    input?.isolationLevel === "sandbox" ||
    input?.isolationLevel === "restricted"
  ) {
    return input.isolationLevel;
  }

  const sessionUserId = input?.userId ?? undefined;
  const currentUserId = input?.currentUserId ?? undefined;
  const workspaceOwnerId = input?.workspaceOwnerId ?? undefined;
  if (sessionUserId && currentUserId && sessionUserId === currentUserId) {
    return "main";
  }
  if (
    workspaceOwnerId &&
    (sessionUserId === workspaceOwnerId || currentUserId === workspaceOwnerId)
  ) {
    return "main";
  }

  return resolveDefaultIsolationLevel().level;
}

export function resolveDefaultSandboxMode(
  isolationLevel: CoworkIsolationLevel
): SessionSandboxModeStatus {
  for (const key of SESSION_SANDBOX_ENV_KEYS) {
    const raw = process.env[key]?.trim().toLowerCase();
    const normalized = normalizeSandboxMode(raw, isolationLevel);
    if (normalized) {
      return { mode: normalized, source: "env", envKey: key };
    }
  }
  return { mode: DEFAULT_SANDBOX_MODES[isolationLevel], source: "default" };
}

export function resolveSessionSandboxMode(input?: {
  isolationLevel?: CoworkIsolationLevel | null;
  sandboxMode?: CoworkSandboxMode | null;
}): CoworkSandboxMode {
  if (
    input?.sandboxMode === "none" ||
    input?.sandboxMode === "workspace-write" ||
    input?.sandboxMode === "docker"
  ) {
    return input.sandboxMode;
  }

  const isolationLevel = resolveSessionIsolation({ isolationLevel: input?.isolationLevel });
  return resolveDefaultSandboxMode(isolationLevel).mode;
}

export function resolveSessionToolAllowlist(input?: {
  isolationLevel?: CoworkIsolationLevel | null;
  toolAllowlist?: string[] | null;
}): string[] {
  if (Array.isArray(input?.toolAllowlist)) {
    return normalizeToolPatterns(input.toolAllowlist);
  }

  const isolationLevel = resolveSessionIsolation({ isolationLevel: input?.isolationLevel });
  if (isolationLevel === "main") {
    return ["*"];
  }
  return isolationLevel === "restricted"
    ? [...RESTRICTED_TOOL_ALLOWLIST]
    : [...SANDBOX_TOOL_ALLOWLIST];
}

export function resolveSessionToolDenylist(input?: { toolDenylist?: string[] | null }): string[] {
  if (Array.isArray(input?.toolDenylist)) {
    return normalizeToolPatterns(input.toolDenylist);
  }
  return [];
}

export function resolveSessionIsolationConfig(
  input?: SessionIsolationConfigInput | null
): SessionIsolationConfig {
  const isolationLevel = resolveSessionIsolation(input ?? undefined);
  const sandboxMode = resolveSessionSandboxMode({
    isolationLevel,
    sandboxMode: input?.sandboxMode ?? undefined,
  });
  const toolAllowlist = resolveSessionToolAllowlist({
    isolationLevel,
    toolAllowlist: input?.toolAllowlist ?? undefined,
  });
  const toolDenylist = resolveSessionToolDenylist({
    toolDenylist: input?.toolDenylist ?? undefined,
  });

  return { isolationLevel, sandboxMode, toolAllowlist, toolDenylist };
}

export function isSandboxSession(session: CoworkSession): boolean {
  return resolveSessionIsolation(session) !== "main";
}

function normalizeSandboxMode(
  raw: string | undefined,
  isolationLevel: CoworkIsolationLevel
): CoworkSandboxMode | null {
  if (!raw) {
    return null;
  }
  if (raw === "none") {
    return "none";
  }
  if (raw === "workspace-write" || raw === "workspace_write") {
    return "workspace-write";
  }
  if (raw === "docker") {
    return "docker";
  }
  if (raw === "process" || raw === "rust") {
    return isolationLevel === "main" ? "none" : "workspace-write";
  }
  return null;
}

function normalizeToolPatterns(list: string[]): string[] {
  const results: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed) {
      results.push(trimmed);
    }
  }
  return results;
}
