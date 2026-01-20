import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type CoworkPolicyConfig,
  computeCoworkRiskScore,
  createDenyAllPolicy,
  DEFAULT_COWORK_POLICY,
  parseCoworkPolicyConfig,
} from "@ku0/agent-runtime";
import type { AuditLogStoreLike } from "../storage/contracts";
import type { CoworkAuditEntry, CoworkSettings } from "../storage/types";

export type CoworkPolicySource = "repo" | "settings" | "default" | "deny_all";

export interface CoworkPolicyResolution {
  config: CoworkPolicyConfig;
  source: CoworkPolicySource;
  reason?: string;
}

export async function resolveCoworkPolicyConfig(options: {
  repoRoot: string;
  settings: CoworkSettings;
  auditLogStore?: AuditLogStoreLike;
  sessionId?: string;
  taskId?: string;
}): Promise<CoworkPolicyResolution> {
  const repoPolicy = await loadRepoPolicy(options.repoRoot);
  if (repoPolicy) {
    if (repoPolicy.source === "deny_all") {
      await logPolicyConfigIssue({
        auditLogStore: options.auditLogStore,
        sessionId: options.sessionId,
        taskId: options.taskId,
        reason: repoPolicy.reason ?? "Invalid repo policy",
      });
    }
    return repoPolicy;
  }

  if (options.settings.policy) {
    const parsed = parseCoworkPolicyConfig(options.settings.policy);
    if (parsed) {
      return { config: parsed, source: "settings" };
    }

    await logPolicyConfigIssue({
      auditLogStore: options.auditLogStore,
      sessionId: options.sessionId,
      taskId: options.taskId,
      reason: "Invalid policy in settings",
    });

    return {
      config: createDenyAllPolicy(),
      source: "deny_all",
      reason: "Invalid policy in settings",
    };
  }

  return { config: DEFAULT_COWORK_POLICY, source: "default" };
}

export async function loadRepoPolicy(repoRoot: string): Promise<CoworkPolicyResolution | null> {
  const policyPath = resolve(repoRoot, ".keepup", "policy.json");

  try {
    const payload = await readFile(policyPath, "utf-8");
    const parsedJson = JSON.parse(payload) as unknown;
    const parsedPolicy = parseCoworkPolicyConfig(parsedJson);
    if (!parsedPolicy) {
      return {
        config: createDenyAllPolicy(),
        source: "deny_all",
        reason: "Invalid repo policy",
      };
    }
    return { config: parsedPolicy, source: "repo" };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    return {
      config: createDenyAllPolicy(),
      source: "deny_all",
      reason: "Failed to read repo policy",
    };
  }
}

async function logPolicyConfigIssue(input: {
  auditLogStore?: AuditLogStoreLike;
  sessionId?: string;
  taskId?: string;
  reason: string;
}): Promise<void> {
  if (!input.auditLogStore || !input.sessionId) {
    return;
  }
  const entry: CoworkAuditEntry = {
    entryId: crypto.randomUUID(),
    sessionId: input.sessionId,
    taskId: input.taskId,
    timestamp: Date.now(),
    action: "policy_decision",
    toolName: "policy:config",
    policyDecision: "deny",
    riskScore: computeCoworkRiskScore([], "deny"),
    reason: input.reason,
    outcome: "denied",
  };
  await input.auditLogStore.log(entry);
}
