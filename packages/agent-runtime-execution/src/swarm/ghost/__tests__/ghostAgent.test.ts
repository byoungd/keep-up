import { describe, expect, it } from "vitest";

import { GhostAgent } from "../ghostAgent";

const nodeCommand = (script: string) =>
  `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

describe("GhostAgent", () => {
  it("skips checks when no command is configured", async () => {
    const agent = new GhostAgent(process.cwd(), { enableWatcher: false });

    const result = await agent.triggerCheck("typecheck");

    expect(result.passed).toBe(true);
    expect(result.issueCount).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("runs configured commands and reports success", async () => {
    const agent = new GhostAgent(process.cwd(), {
      enableWatcher: false,
      checkCommands: {
        lint: nodeCommand("console.log('ok')"),
      },
    });

    const result = await agent.triggerCheck("lint");

    expect(result.passed).toBe(true);
    expect(result.issueCount).toBe(0);
    expect(result.summary).toContain("passed");
  });

  it("reports failure when a command exits non-zero", async () => {
    const agent = new GhostAgent(process.cwd(), {
      enableWatcher: false,
      checkCommands: {
        test: nodeCommand("process.exit(2)"),
      },
    });

    const result = await agent.triggerCheck("test");

    expect(result.passed).toBe(false);
    expect(result.issueCount).toBeGreaterThan(0);
    expect(result.summary).toContain("failed");
  });
});
