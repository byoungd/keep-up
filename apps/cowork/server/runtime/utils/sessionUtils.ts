/**
 * Utility functions for session and task metadata
 */

import type { CoworkIsolationLevel, CoworkSession } from "@ku0/agent-runtime";

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
    if (raw === "main" || raw === "sandbox") {
      return { level: raw, source: "env", envKey: key };
    }
  }
  return { level: "main", source: "default" };
}

export function resolveSessionIsolation(
  session?: { isolationLevel?: CoworkIsolationLevel | null } | null
): CoworkIsolationLevel {
  if (session?.isolationLevel === "main" || session?.isolationLevel === "sandbox") {
    return session.isolationLevel;
  }
  return resolveDefaultIsolationLevel().level;
}

export function isSandboxSession(session: CoworkSession): boolean {
  return resolveSessionIsolation(session) === "sandbox";
}
