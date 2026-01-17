import type { PreflightCheckDefinition, PreflightPlan } from "./types";

export interface PreflightSelectionRule {
  id: string;
  match: (path: string) => boolean;
  checkIds: string[];
  note: string;
}

export interface PreflightSelectionInput {
  allowlist: PreflightCheckDefinition[];
  rules: PreflightSelectionRule[];
  changedFiles: string[];
  defaultCheckIds: string[];
}

// biome-ignore lint:complexity/noExcessiveCognitiveComplexity
export function selectPreflightChecks(input: PreflightSelectionInput): PreflightPlan {
  const allowlist = new Map(input.allowlist.map((check) => [check.id, check]));
  const selected = new Set<string>();
  const selectionNotes: string[] = [];

  for (const rule of input.rules) {
    const matched = input.changedFiles.some((path) => rule.match(path));
    if (!matched) {
      continue;
    }
    selectionNotes.push(rule.note);
    for (const id of rule.checkIds) {
      if (allowlist.has(id)) {
        selected.add(id);
      }
    }
  }

  if (selected.size === 0) {
    for (const id of input.defaultCheckIds) {
      if (allowlist.has(id)) {
        selected.add(id);
      }
    }
    if (input.defaultCheckIds.length > 0) {
      selectionNotes.push("Default preflight checks applied.");
    }
  }

  const checks = Array.from(selected)
    .map((id) => allowlist.get(id))
    .filter((check): check is PreflightCheckDefinition => Boolean(check));

  return {
    checks,
    changedFiles: input.changedFiles,
    selectionNotes,
  };
}
