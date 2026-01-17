/**
 * Utility functions for session and task metadata
 */

import type { CoworkSession } from "@ku0/agent-runtime";

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
