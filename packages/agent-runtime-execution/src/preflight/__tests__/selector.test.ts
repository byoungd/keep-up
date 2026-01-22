import { describe, expect, it } from "vitest";
import { type PreflightSelectionRule, selectPreflightChecks } from "../selector";
import type { PreflightCheckDefinition } from "../types";

const allowlist: PreflightCheckDefinition[] = [
  {
    id: "lint",
    name: "Lint",
    kind: "lint",
    command: "pnpm",
    args: ["lint"],
  },
  {
    id: "typecheck",
    name: "Typecheck",
    kind: "typecheck",
    command: "pnpm",
    args: ["typecheck"],
  },
  {
    id: "tests",
    name: "Tests",
    kind: "test",
    command: "pnpm",
    args: ["test"],
  },
];

const rules: PreflightSelectionRule[] = [
  {
    id: "ts-changes",
    match: (path) => path.endsWith(".ts"),
    checkIds: ["lint", "typecheck"],
    note: "TypeScript files changed.",
  },
  {
    id: "test-changes",
    match: (path) => path.includes("__tests__"),
    checkIds: ["tests"],
    note: "Test files changed.",
  },
];

describe("selectPreflightChecks", () => {
  it("selects checks from matching rules", () => {
    const plan = selectPreflightChecks({
      allowlist,
      rules,
      changedFiles: ["src/index.ts"],
      defaultCheckIds: ["lint"],
    });

    expect(plan.checks.map((check) => check.id).sort()).toEqual(["lint", "typecheck"]);
    expect(plan.selectionNotes).toEqual(["TypeScript files changed."]);
  });

  it("falls back to defaults when no rule matches", () => {
    const plan = selectPreflightChecks({
      allowlist,
      rules,
      changedFiles: ["README.md"],
      defaultCheckIds: ["lint"],
    });

    expect(plan.checks.map((check) => check.id)).toEqual(["lint"]);
    expect(plan.selectionNotes).toEqual(["Default preflight checks applied."]);
  });

  it("skips default note when defaults are not in the allowlist", () => {
    const plan = selectPreflightChecks({
      allowlist,
      rules: [],
      changedFiles: ["README.md"],
      defaultCheckIds: ["missing"],
    });

    expect(plan.checks).toEqual([]);
    expect(plan.selectionNotes).toEqual([]);
  });

  it("keeps rule notes and adds defaults when needed", () => {
    const plan = selectPreflightChecks({
      allowlist,
      rules: [
        {
          id: "docs",
          match: (path) => path.endsWith(".md"),
          checkIds: ["missing"],
          note: "Docs changed.",
        },
      ],
      changedFiles: ["docs/guide.md"],
      defaultCheckIds: ["lint"],
    });

    expect(plan.checks.map((check) => check.id)).toEqual(["lint"]);
    expect(plan.selectionNotes).toEqual(["Docs changed.", "Default preflight checks applied."]);
  });
});
