import path from "node:path";
import { PolicyEngine } from "./PolicyEngine";
import type { ApprovalDecision, ApprovalPolicy, WorkspaceContext } from "./types";

export interface AutoApprovalConfig {
  policies: ApprovalPolicy[];
  cacheDecisions?: boolean;
}

export class AutoApprover {
  private readonly policyEngine: PolicyEngine;
  private readonly cacheDecisions: boolean;
  private readonly userApprovalCache = new Map<string, ApprovalDecision>();

  constructor(config: AutoApprovalConfig) {
    this.policyEngine = new PolicyEngine(config.policies);
    this.cacheDecisions = config.cacheDecisions ?? true;
  }

  shouldAutoApprove(
    toolName: string,
    params: Record<string, unknown>,
    workspaceContext: WorkspaceContext
  ): ApprovalDecision {
    const cacheKey = this.getCacheKey(toolName, params);
    const cached = this.userApprovalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.isFileOperation(toolName)) {
      const targetPath = this.getPathParam(params);
      if (targetPath && !this.isApprovedPath(targetPath, workspaceContext)) {
        return {
          approved: false,
          requiresUserConfirmation: true,
          reason: "Path outside approved workspace",
        };
      }
    }

    const policy = this.policyEngine.findMatchingPolicy(toolName, params);
    const decision = policy ? this.applyPolicy(policy) : this.defaultDecision();

    if (this.cacheDecisions) {
      this.userApprovalCache.set(cacheKey, decision);
    }

    return decision;
  }

  clearCache(): void {
    this.userApprovalCache.clear();
  }

  private applyPolicy(policy: ApprovalPolicy): ApprovalDecision {
    if (policy.action === "approve") {
      return {
        approved: true,
        requiresUserConfirmation: false,
        policyName: policy.name,
      };
    }

    if (policy.action === "deny") {
      return {
        approved: false,
        requiresUserConfirmation: false,
        policyName: policy.name,
        reason: "Denied by policy",
      };
    }

    return {
      approved: false,
      requiresUserConfirmation: true,
      policyName: policy.name,
    };
  }

  private defaultDecision(): ApprovalDecision {
    return {
      approved: false,
      requiresUserConfirmation: true,
    };
  }

  private isFileOperation(toolName: string): boolean {
    return toolName.startsWith("file:") || toolName.startsWith("file.");
  }

  private getPathParam(params: Record<string, unknown>): string | undefined {
    const value = params.path;
    if (typeof value === "string") {
      return value;
    }
    const alt = params.filePath;
    return typeof alt === "string" ? alt : undefined;
  }

  private isApprovedPath(targetPath: string, context: WorkspaceContext): boolean {
    const resolvedTarget = path.resolve(targetPath);
    return context.workspacePaths.some((root) => {
      const resolvedRoot = path.resolve(root);
      return (
        resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
      );
    });
  }

  private getCacheKey(toolName: string, params: Record<string, unknown>): string {
    return `${toolName}:${stableStringify(params)}`;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([key, val]) => `${key}:${stableStringify(val)}`).join(",")}}`;
}
