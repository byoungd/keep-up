import type { ApprovalCondition, ApprovalPolicy } from "./types";

export class PolicyEngine {
  private readonly policies: ApprovalPolicy[];

  constructor(policies: ApprovalPolicy[]) {
    this.policies = [...policies].sort((a, b) => b.priority - a.priority);
  }

  findMatchingPolicy(
    toolName: string,
    params: Record<string, unknown>
  ): ApprovalPolicy | undefined {
    return this.policies.find((policy) => {
      if (!matchesTool(toolName, policy.tools)) {
        return false;
      }
      if (!policy.conditions || policy.conditions.length === 0) {
        return true;
      }
      return policy.conditions.every((condition) => evaluateCondition(condition, params));
    });
  }
}

function matchesTool(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*") {
      return true;
    }
    if (pattern.endsWith("*")) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return toolName === pattern;
  });
}

function evaluateCondition(condition: ApprovalCondition, params: Record<string, unknown>): boolean {
  const value = resolveConditionValue(condition.type, params);
  if (value === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "equals":
      return value === condition.value;
    case "contains":
      return typeof value === "string" && String(value).includes(String(condition.value));
    case "matches":
      return matchesPattern(value, condition.value);
    case "lessThan":
      return typeof value === "number" && value < Number(condition.value);
    case "greaterThan":
      return typeof value === "number" && value > Number(condition.value);
    default:
      return false;
  }
}

function resolveConditionValue(type: ApprovalCondition["type"], params: Record<string, unknown>) {
  switch (type) {
    case "path":
      return findStringParam(params, ["path", "filePath", "targetPath"]);
    case "content":
      return findStringParam(params, ["content", "text", "prompt"]);
    case "size": {
      const sizeParam = params.size;
      if (typeof sizeParam === "number") {
        return sizeParam;
      }
      const content = findStringParam(params, ["content", "text"]);
      return content ? content.length : undefined;
    }
    case "risk":
      return findStringParam(params, ["risk", "riskLevel"]);
    default:
      return undefined;
  }
}

function findStringParam(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function matchesPattern(value: unknown, pattern: string | number | RegExp): boolean {
  if (typeof value !== "string") {
    return false;
  }
  if (pattern instanceof RegExp) {
    return pattern.test(value);
  }
  const regex = new RegExp(String(pattern));
  return regex.test(value);
}
