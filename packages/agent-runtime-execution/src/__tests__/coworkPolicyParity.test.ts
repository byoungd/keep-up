import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CoworkPolicyEngine,
  type CoworkPolicyInput,
  parseCoworkPolicyConfig,
} from "../cowork/policy";

type PolicyVector = {
  id: string;
  config: unknown;
  cases: Array<{
    name: string;
    input: CoworkPolicyInput;
    expected: {
      decision: "allow" | "allow_with_confirm" | "deny";
      requiresConfirmation?: boolean;
      ruleId?: string;
      reason?: string;
      riskTags?: string[];
    };
  }>;
};

type PolicyVectorFile = {
  version: string;
  policies: PolicyVector[];
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const vectorPath = resolve(
  currentDir,
  "../../../agent-runtime-core/src/policy/cowork-policy-parity.json"
);

const vectors = JSON.parse(readFileSync(vectorPath, "utf-8")) as PolicyVectorFile;

function assertPolicyCase(
  policyId: string,
  testCase: PolicyVector["cases"][number],
  decision: {
    decision: string;
    requiresConfirmation: boolean;
    ruleId?: string;
    reason: string;
    riskTags: string[];
  }
): void {
  if (decision.decision !== testCase.expected.decision) {
    throw new Error(
      `Policy ${policyId} case ${testCase.name}: expected ${testCase.expected.decision} but got ${decision.decision}`
    );
  }

  if (testCase.expected.requiresConfirmation !== undefined) {
    expect(decision.requiresConfirmation).toBe(testCase.expected.requiresConfirmation);
  }
  if (testCase.expected.ruleId) {
    expect(decision.ruleId).toBe(testCase.expected.ruleId);
  }
  if (testCase.expected.reason) {
    expect(decision.reason).toBe(testCase.expected.reason);
  }
  if (testCase.expected.riskTags) {
    expect(decision.riskTags).toEqual(expect.arrayContaining(testCase.expected.riskTags));
  }
}

function assertPolicyVector(policy: PolicyVector): void {
  const parsed = parseCoworkPolicyConfig(policy.config);
  if (!parsed) {
    throw new Error(`Invalid policy config in vector: ${policy.id}`);
  }
  const engine = new CoworkPolicyEngine(parsed);

  for (const testCase of policy.cases) {
    const decision = engine.evaluate(testCase.input);
    assertPolicyCase(policy.id, testCase, {
      decision: decision.decision,
      requiresConfirmation: decision.requiresConfirmation,
      ruleId: decision.ruleId,
      reason: decision.reason,
      riskTags: decision.riskTags,
    });
  }
}

describe("Cowork policy parity vectors", () => {
  for (const policy of vectors.policies) {
    it(`evaluates ${policy.id} policy cases`, () => {
      assertPolicyVector(policy);
    });
  }
});
