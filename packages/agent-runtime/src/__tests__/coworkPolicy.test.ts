/**
 * Cowork Policy Tests
 */

import { InMemoryMetricsCollector } from "@ku0/agent-runtime-telemetry/telemetry";
import { describe, expect, it } from "vitest";
import { type CoworkPolicyConfig, CoworkPolicyEngine } from "../cowork/policy";

const policyConfig: CoworkPolicyConfig = {
  version: "1.0",
  defaults: { fallback: "deny" },
  rules: [
    {
      id: "deny-secrets",
      action: "file.read",
      when: { matchesPattern: ["**/.env*"] },
      decision: "deny",
      reason: "sensitive",
    },
    {
      id: "allow-read",
      action: "file.read",
      when: { pathWithinGrant: true },
      decision: "allow",
    },
    {
      id: "confirm-write",
      action: "file.write",
      when: { pathWithinGrant: true, pathWithinOutputRoot: false },
      decision: "allow_with_confirm",
      riskTags: ["overwrite"],
    },
  ],
};

describe("CoworkPolicyEngine", () => {
  it("allows reads within grants", () => {
    const engine = new CoworkPolicyEngine(policyConfig);

    const decision = engine.evaluate({
      action: "file.read",
      path: "/workspace/docs/readme.md",
      grantRoots: ["/workspace"],
    });

    expect(decision.decision).toBe("allow");
    expect(decision.requiresConfirmation).toBe(false);
  });

  it("requires confirmation for writes outside output roots", () => {
    const engine = new CoworkPolicyEngine(policyConfig);

    const decision = engine.evaluate({
      action: "file.write",
      path: "/workspace/docs/readme.md",
      grantRoots: ["/workspace"],
      outputRoots: ["/workspace/output"],
    });

    expect(decision.decision).toBe("allow_with_confirm");
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.riskTags).toContain("overwrite");
  });

  it("denies sensitive paths", () => {
    const engine = new CoworkPolicyEngine(policyConfig);

    const decision = engine.evaluate({
      action: "file.read",
      path: "/workspace/.env",
      grantRoots: ["/workspace"],
    });

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toBe("sensitive");
  });

  it("records telemetry and denials", () => {
    const metrics = new InMemoryMetricsCollector();
    const tracer = {
      withSpan: async (_name: string, fn: (span: { setAttribute: () => void }) => Promise<void>) =>
        fn({
          setAttribute: () => {
            // no-op
          },
        }),
    };
    const engine = new CoworkPolicyEngine(policyConfig, { telemetry: { metrics, tracer } });

    const decision = engine.evaluate({
      action: "file.read",
      path: "/workspace/.env",
      grantRoots: ["/workspace"],
    });

    expect(decision.decision).toBe("deny");
    const output = metrics.toPrometheus();
    expect(output).toContain("cowork_policy_evaluations_total");
    expect(output).toContain("cowork_policy_denials_total");
    expect(output).toContain("cowork_policy_latency_ms");
  });

  it("returns cached decisions when enabled", () => {
    const engine = new CoworkPolicyEngine(policyConfig, { enableDecisionCache: true });

    const first = engine.evaluate({
      action: "file.read",
      path: "/workspace/docs/readme.md",
      grantRoots: ["/workspace"],
    });
    const second = engine.evaluate({
      action: "file.read",
      path: "/workspace/docs/readme.md",
      grantRoots: ["/workspace"],
    });

    expect(second).toEqual(first);
  });

  it("prefers exact rules over wildcard rules", () => {
    const engine = new CoworkPolicyEngine({
      version: "1.0",
      defaults: { fallback: "deny" },
      rules: [
        {
          id: "wildcard-allow",
          action: "file.*",
          decision: "allow",
        },
        {
          id: "exact-deny",
          action: "file.read",
          decision: "deny",
          reason: "exact rule wins",
        },
      ],
    });

    const decision = engine.evaluate({ action: "file.read" });

    expect(decision.decision).toBe("deny");
    expect(decision.ruleId).toBe("exact-deny");
  });
});
