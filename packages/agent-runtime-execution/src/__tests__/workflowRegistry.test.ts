import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowRegistry } from "../workflows/workflowRegistry";

const WORKFLOW_DOC = `---
id: tdd
name: TDD Workflow
description: Test-driven development workflow
riskLevel: low
required-tools:
  - file
  - code
success-criteria:
  - tests pass
depends-on:
  - base
phases:
  - id: write-tests
    order: 1
    name: Write Tests
    description: Create tests first
    tools: [file]
    outputs: [tests]
    parallelizable: false
  - id: implement
    order: 2
    name: Implement
    description: Write minimal code to pass tests
    tools: [file]
    outputs: [code]
    parallelizable: false
---
# TDD Workflow
`;

describe("WorkflowRegistry", () => {
  let root = "";

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("discovers workflow templates from directories", async () => {
    root = await mkdtemp(join(tmpdir(), "workflow-registry-"));
    const workflowDir = join(root, "tdd");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(join(workflowDir, "WORKFLOW.md"), WORKFLOW_DOC, "utf-8");

    const registry = new WorkflowRegistry({ roots: [{ path: root }] });
    const result = await registry.discover();

    expect(result.errors).toHaveLength(0);
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0]?.id).toBe("tdd");
    expect(result.workflows[0]?.dependsOn).toEqual(["base"]);
    expect(result.workflows[0]?.phases).toHaveLength(2);
  });

  it("records validation errors for invalid workflows", async () => {
    root = await mkdtemp(join(tmpdir(), "workflow-registry-invalid-"));
    const workflowDir = join(root, "invalid");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(
      join(workflowDir, "WORKFLOW.md"),
      `---\nname: Missing id\nriskLevel: low\nphases: []\n---`,
      "utf-8"
    );

    const registry = new WorkflowRegistry({ roots: [{ path: root }] });
    const result = await registry.discover();

    expect(result.workflows).toHaveLength(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.reason).toContain("required field");
  });
});
