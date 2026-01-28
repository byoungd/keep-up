/**
 * Node Result Cache
 *
 * Caches tool results at the task node level for repeatable executions.
 */

import type {
  MCPToolCall,
  MCPToolResult,
  ToolContext,
  ToolGovernancePolicyRule,
  ToolSafetyCheckerLike,
} from "../types";

export interface NodeResultCacheConfig {
  ttlMs?: number;
  maxSize?: number;
  includePolicyContext?: boolean;
}

type NodeCacheEntry = {
  result: MCPToolResult;
  timestamp: number;
};

export class NodeResultCache {
  private readonly cache = new Map<string, NodeCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly includePolicyContext: boolean;

  constructor(config: NodeResultCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? 60_000;
    this.maxSize = config.maxSize ?? 200;
    this.includePolicyContext = config.includePolicyContext ?? true;
  }

  get(call: MCPToolCall, context: ToolContext): MCPToolResult | undefined {
    const key = this.generateKey(call, context);
    if (!key) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  set(call: MCPToolCall, context: ToolContext, result: MCPToolResult): void {
    if (!result.success) {
      return;
    }

    const key = this.generateKey(call, context);
    if (!key) {
      return;
    }

    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  private generateKey(call: MCPToolCall, context: ToolContext): string | null {
    const nodeId = context.taskNodeId;
    if (!nodeId) {
      return null;
    }

    const args = stableSort(call.arguments);
    const base = `${nodeId}:${call.name}:${JSON.stringify(args)}`;
    if (!this.includePolicyContext || !context.toolExecution) {
      return base;
    }

    const policy = context.toolExecution;
    const policyKey = {
      policy: policy.policy,
      allowedTools: [...policy.allowedTools].sort(),
      requiresApproval: [...policy.requiresApproval].sort(),
      maxParallel: policy.maxParallel,
      governanceDefaultAction: policy.governanceDefaultAction,
      governanceRules: serializeGovernanceRules(policy.governanceRules),
      safetyCheckers: serializeSafetyCheckers(policy.safetyCheckers),
    };

    return `${base}:${JSON.stringify(policyKey)}`;
  }
}

function stableSort(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const result: Record<string, unknown> = {};

  for (const [key, entry] of entries) {
    result[key] = stableSort(entry);
  }

  return result;
}

function serializeGovernanceRules(rules: ToolGovernancePolicyRule[] | undefined): unknown {
  if (!rules || rules.length === 0) {
    return undefined;
  }
  return rules.map((rule) => ({
    id: rule.id,
    action: rule.action,
    tools: rule.tools,
    toolPatterns: rule.toolPatterns,
    tool: rule.tool,
    conditions: rule.conditions?.map((condition) => ({
      path: condition.path,
      operator: condition.operator,
      value: condition.value instanceof RegExp ? condition.value.toString() : condition.value,
    })),
    priority: rule.priority,
    reason: rule.reason,
    reasonCode: rule.reasonCode,
    riskTags: rule.riskTags,
  }));
}

function serializeSafetyCheckers(
  checkers: ToolSafetyCheckerLike[] | undefined
): string[] | undefined {
  if (!checkers || checkers.length === 0) {
    return undefined;
  }
  return checkers.map((checker, index) => {
    if (typeof checker === "function") {
      return `fn:${checker.name || "anonymous"}:${index}`;
    }
    return `id:${checker.id}`;
  });
}
