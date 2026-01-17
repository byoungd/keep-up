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

export function selectPreflightChecks(input: PreflightSelectionInput): PreflightPlan {
  const allowlist = new Map(input.allowlist.map((check) => [check.id, check]));
  const selected = new Set<string>();
  const selectionNotes: string[] = [];

  applySelectionRules(input, allowlist, selected, selectionNotes);

  if (selected.size === 0) {
    const defaultsAdded = addChecks(input.defaultCheckIds, allowlist, selected);
    if (defaultsAdded) {
      selectionNotes.push("Default preflight checks applied.");
    }
  }

  const checks = collectChecks(selected, allowlist);

  return {
    checks,
    changedFiles: input.changedFiles,
    selectionNotes,
  };
}

function applySelectionRules(
  input: PreflightSelectionInput,
  allowlist: Map<string, PreflightCheckDefinition>,
  selected: Set<string>,
  selectionNotes: string[]
): void {
  for (const rule of input.rules) {
    if (!matchesRule(input.changedFiles, rule)) {
      continue;
    }
    selectionNotes.push(rule.note);
    addChecks(rule.checkIds, allowlist, selected);
  }
}

function matchesRule(changedFiles: string[], rule: PreflightSelectionRule): boolean {
  for (const file of changedFiles) {
    if (rule.match(file)) {
      return true;
    }
  }
  return false;
}

function addChecks(
  checkIds: string[],
  allowlist: Map<string, PreflightCheckDefinition>,
  selected: Set<string>
): boolean {
  let added = false;
  for (const id of checkIds) {
    if (allowlist.has(id) && !selected.has(id)) {
      selected.add(id);
      added = true;
    }
  }
  return added;
}

function collectChecks(
  selected: Set<string>,
  allowlist: Map<string, PreflightCheckDefinition>
): PreflightCheckDefinition[] {
  const checks: PreflightCheckDefinition[] = [];
  for (const id of selected) {
    const check = allowlist.get(id);
    if (check) {
      checks.push(check);
    }
  }
  return checks;
}
