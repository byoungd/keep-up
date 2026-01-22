import type { ToolPolicyContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { ToolWorkbenchPolicyEngine } from "../tools/workbench/policyEngine";

const baseContext = { security: { ...SECURITY_PRESETS.safe } };

function createPolicyContext(name: string, args: Record<string, unknown> = {}): ToolPolicyContext {
  const [tool, operation] = name.includes(":") ? name.split(":") : [name, name];
  return {
    call: { name, arguments: args },
    tool,
    operation: operation ?? name,
    context: baseContext,
  };
}

describe("ToolWorkbenchPolicyEngine", () => {
  it("allows matching allow rules", () => {
    const engine = new ToolWorkbenchPolicyEngine({
      rules: [
        {
          id: "allow-read",
          action: "allow",
          tools: ["file:read"],
          reasonCode: "allow_read",
        },
      ],
      defaultAction: "ask",
    });

    const decision = engine.evaluate(createPolicyContext("file:read", { path: "/tmp/a.txt" }));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.reasonCode).toBe("allow_read");
  });

  it("asks for matching ask rules", () => {
    const engine = new ToolWorkbenchPolicyEngine({
      rules: [
        {
          id: "ask-write",
          action: "ask",
          tools: ["file:write"],
          reasonCode: "ask_write",
        },
      ],
      defaultAction: "allow",
    });

    const decision = engine.evaluate(createPolicyContext("file:write", { path: "/tmp/a.txt" }));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.reasonCode).toBe("ask_write");
  });

  it("denies matching deny rules", () => {
    const engine = new ToolWorkbenchPolicyEngine({
      rules: [
        {
          id: "deny-shell",
          action: "deny",
          tools: ["bash:*"],
          reasonCode: "deny_shell",
        },
      ],
      defaultAction: "allow",
    });

    const decision = engine.evaluate(createPolicyContext("bash:execute", { command: "rm -rf /" }));
    expect(decision.allowed).toBe(false);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.reasonCode).toBe("deny_shell");
  });
});
