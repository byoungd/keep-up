import type {
  ToolPolicyContext,
  ToolPolicyDecision,
  ToolPolicyEngine,
} from "@ku0/agent-runtime-core";
import type { SkillRegistry } from "./skillRegistry";

export class SkillPolicyGuard implements ToolPolicyEngine {
  private readonly base: ToolPolicyEngine;
  private readonly registry: SkillRegistry;

  constructor(base: ToolPolicyEngine, registry: SkillRegistry) {
    this.base = base;
    this.registry = registry;
  }

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.base.evaluate(context);
    if (!baseDecision.allowed) {
      return baseDecision;
    }

    const riskTags = new Set(baseDecision.riskTags ?? []);
    let requiresConfirmation = baseDecision.requiresConfirmation;

    const runScriptDecision = this.evaluateRunScript(context);
    if (runScriptDecision.requiresConfirmation) {
      requiresConfirmation = true;
      if (runScriptDecision.riskTag) {
        riskTags.add(runScriptDecision.riskTag);
      }
    }

    const allowlistDecision = this.evaluateAllowedTools(context);
    if (!allowlistDecision.allowed) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: allowlistDecision.reason,
        riskTags: allowlistDecision.riskTags,
      };
    }

    return {
      allowed: true,
      requiresConfirmation,
      reason: baseDecision.reason,
      riskTags: riskTags.size > 0 ? Array.from(riskTags) : undefined,
    };
  }

  private evaluateRunScript(context: ToolPolicyContext): {
    requiresConfirmation: boolean;
    riskTag?: string;
  } {
    if (context.tool !== "skills" || context.operation !== "run_script") {
      return { requiresConfirmation: false };
    }

    const skillId = this.extractSkillId(context);
    if (!skillId) {
      return { requiresConfirmation: false };
    }

    const entry = this.registry.get(skillId);
    if (!entry) {
      return { requiresConfirmation: false };
    }

    if (entry.source === "user") {
      return { requiresConfirmation: true, riskTag: "skill:user" };
    }

    if (entry.source === "third_party") {
      return { requiresConfirmation: true, riskTag: "skill:third-party" };
    }

    return { requiresConfirmation: false };
  }

  private extractSkillId(context: ToolPolicyContext): string | null {
    const args = context.call.arguments as Record<string, unknown>;
    if (typeof args.skillId === "string") {
      return args.skillId;
    }
    if (typeof args.name === "string") {
      return args.name;
    }
    return null;
  }

  private evaluateAllowedTools(context: ToolPolicyContext): {
    allowed: boolean;
    reason?: string;
    riskTags?: string[];
  } {
    if (context.tool === "skills") {
      return { allowed: true };
    }

    const toolName = `${context.tool}:${context.operation}`.toLowerCase();
    if (toolName === "completion:complete_task" || toolName.endsWith(":complete_task")) {
      return { allowed: true };
    }

    const activeSkills = context.context.skills?.activeSkills ?? [];
    if (activeSkills.length === 0) {
      return { allowed: true };
    }

    for (const activation of activeSkills) {
      const entry = this.registry.get(activation.skillId);
      if (!entry || entry.allowedTools === undefined) {
        continue;
      }

      const patterns = normalizePatterns(entry.allowedTools);
      if (patterns.length === 0) {
        return {
          allowed: false,
          reason: `Tool "${toolName}" not allowed by skill "${entry.name}"`,
          riskTags: ["skill:allowlist"],
        };
      }

      const matches = patterns.some((pattern) => matchesAllowedPattern(toolName, pattern, context));
      if (!matches) {
        return {
          allowed: false,
          reason: `Tool "${toolName}" not allowed by skill "${entry.name}"`,
          riskTags: ["skill:allowlist"],
        };
      }
    }

    return { allowed: true };
  }
}

export function createSkillPolicyGuard(
  base: ToolPolicyEngine,
  registry: SkillRegistry
): SkillPolicyGuard {
  return new SkillPolicyGuard(base, registry);
}

type AllowedToolPattern = {
  toolPattern: string;
  commandPattern?: string;
};

const CLAUDE_TOOL_ALIASES: Record<string, string> = {
  bash: "bash:execute",
  read: "file:read",
  write: "file:write",
};

function normalizePatterns(values: string[]): AllowedToolPattern[] {
  const patterns: AllowedToolPattern[] = [];
  for (const value of values) {
    const normalized = normalizePattern(value);
    if (normalized) {
      patterns.push(normalized);
    }
  }
  return patterns;
}

function normalizePattern(value: string): AllowedToolPattern | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return { toolPattern: "*" };
  }

  const claudeMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)(?:\(([^)]*)\))?$/);
  if (claudeMatch) {
    const toolName = claudeMatch[1].toLowerCase();
    const mappedTool = CLAUDE_TOOL_ALIASES[toolName] ?? toolName;
    const toolPattern = normalizeToolPattern(mappedTool);
    if (!toolPattern) {
      return null;
    }
    const constraintRaw = claudeMatch[2]?.trim();
    if (constraintRaw) {
      if (toolName !== "bash") {
        return null;
      }
      const commandPattern = normalizeCommandPattern(constraintRaw);
      if (!commandPattern) {
        return null;
      }
      return { toolPattern, commandPattern };
    }
    return { toolPattern };
  }

  const toolPattern = normalizeToolPattern(trimmed);
  if (!toolPattern) {
    return null;
  }
  return { toolPattern };
}

function normalizeToolPattern(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }
  if (!trimmed.includes(":")) {
    return `${trimmed}:*`;
  }
  return trimmed;
}

function normalizeCommandPattern(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }
  if (!trimmed.includes(":")) {
    return `${trimmed}:*`;
  }
  return trimmed;
}

function matchesAllowedPattern(
  toolName: string,
  pattern: AllowedToolPattern,
  context: ToolPolicyContext
): boolean {
  if (!matchesPattern(toolName, pattern.toolPattern)) {
    return false;
  }

  if (!pattern.commandPattern) {
    return true;
  }

  if (toolName !== "bash:execute") {
    return false;
  }

  const args = context.call.arguments as Record<string, unknown>;
  const command = typeof args.command === "string" ? args.command : "";
  const signature = buildCommandSignature(command);
  if (!signature) {
    return false;
  }

  return matchesPattern(signature, pattern.commandPattern);
}

function buildCommandSignature(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return null;
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (lower === "sudo") {
      index += 1;
      continue;
    }
    if (token.includes("=") && !token.startsWith("=") && !token.includes("/")) {
      index += 1;
      continue;
    }
    break;
  }

  if (index >= tokens.length) {
    return null;
  }

  return tokens
    .slice(index)
    .map((token) => token.toLowerCase())
    .join(":");
}

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`, "i");
  return regex.test(toolName);
}
