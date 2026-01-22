/**
 * Prompt Injection Guard
 *
 * Heuristic prompt injection detection for tool inputs and outputs.
 *
 * ## Defense-in-Depth Notice
 * This guard provides pattern-based and entropy-based detection as one layer
 * of a multi-layer security strategy. It should NOT be relied upon as the sole
 * protection against prompt injection attacks.
 *
 * ### Known Limitations
 * - Pattern-based detection can be bypassed via:
 *   - Unicode homoglyphs (e.g., Cyrillic 'а' vs Latin 'a')
 *   - Novel phrasings not covered by patterns
 *   - Encoding tricks (base64, HTML entities, etc.)
 * - Entropy analysis may produce false positives on legitimate code/data
 * - Truncation for performance may miss injections in later content
 *
 * ### Recommendations
 * 1. Use in combination with output sandboxing and privilege separation
 * 2. Monitor and log high-risk assessments for review
 * 3. Apply tool-level allowlists for sensitive operations
 * 4. Consider human-in-the-loop for external connector outputs
 */

import {
  assessPromptInjection,
  type CoworkContentSource,
  detectSignals,
} from "../cowork/injectionGuard";
import type { MCPTool, MCPToolCall, MCPToolResult, ToolContent, ToolContext } from "../types";

export type PromptInjectionRisk = "low" | "medium" | "high";

export interface PromptInjectionAssessment {
  risk: PromptInjectionRisk;
  signals: string[];
  source: CoworkContentSource;
  truncated: boolean;
}

export interface PromptInjectionPolicy {
  enabled: boolean;
  blockOnRisk: PromptInjectionRisk;
  maxContentChars: number;
  maxDepth: number;
  /** Per-tool or per-connector overrides keyed by tool name or server prefix. */
  connectorOverrides?: Record<string, PromptInjectionPolicyOverride>;
}

export type PromptInjectionPolicyOverride = Partial<
  Omit<PromptInjectionPolicy, "connectorOverrides">
>;

export const DEFAULT_PROMPT_INJECTION_POLICY: PromptInjectionPolicy = {
  enabled: true,
  blockOnRisk: "high",
  maxContentChars: 20000,
  maxDepth: 5,
};

export interface PromptInjectionGuardResult {
  assessment: PromptInjectionAssessment;
}

export interface PromptInjectionGuard {
  assessInput(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    context: ToolContext,
    policy: PromptInjectionPolicy
  ): PromptInjectionGuardResult | null;
  assessOutput(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    result: MCPToolResult,
    context: ToolContext,
    policy: PromptInjectionPolicy
  ): PromptInjectionGuardResult | null;
}

export class DefaultPromptInjectionGuard implements PromptInjectionGuard {
  assessInput(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    _context: ToolContext,
    policy: PromptInjectionPolicy
  ): PromptInjectionGuardResult | null {
    const source = resolveSource(tool);
    const { text, truncated } = collectText(call.arguments, policy);
    if (!text) {
      return null;
    }
    return {
      assessment: assessText(text, source, truncated),
    };
  }

  assessOutput(
    _call: MCPToolCall,
    tool: MCPTool | undefined,
    result: MCPToolResult,
    _context: ToolContext,
    policy: PromptInjectionPolicy
  ): PromptInjectionGuardResult | null {
    if (!result.success) {
      return null;
    }

    const source = resolveSource(tool);
    const { text, truncated } = collectToolContent(result.content, policy);
    if (!text) {
      return null;
    }

    return {
      assessment: assessText(text, source, truncated),
    };
  }
}

const RISK_ORDER: Record<PromptInjectionRisk, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function shouldBlockPromptInjection(
  assessment: PromptInjectionAssessment,
  policy: PromptInjectionPolicy
): boolean {
  return RISK_ORDER[assessment.risk] >= RISK_ORDER[policy.blockOnRisk];
}

export function resolvePromptInjectionPolicy(
  policy: PromptInjectionPolicy,
  toolName?: string
): PromptInjectionPolicy {
  if (!toolName || !policy.connectorOverrides) {
    return policy;
  }

  const overrides = policy.connectorOverrides;
  const prefix = toolName.includes(":") ? toolName.split(":")[0] : undefined;
  const prefixOverride = prefix ? overrides[prefix] : undefined;
  const toolOverride = overrides[toolName];

  if (!prefixOverride && !toolOverride) {
    return policy;
  }

  return {
    ...policy,
    ...(prefixOverride ?? {}),
    ...(toolOverride ?? {}),
    connectorOverrides: policy.connectorOverrides,
  };
}

function resolveSource(tool?: MCPTool): CoworkContentSource {
  if (tool?.annotations?.category === "external") {
    return { type: "connector", trusted: false };
  }
  return { type: "local", trusted: true };
}

function assessText(
  text: string,
  source: CoworkContentSource,
  truncated: boolean
): PromptInjectionAssessment {
  const signals = detectSignals(text);
  const assessment = assessPromptInjection(text, source);

  return {
    risk: assessment.risk,
    signals,
    source,
    truncated,
  };
}

function collectText(
  value: unknown,
  policy: PromptInjectionPolicy
): { text: string; truncated: boolean } {
  const segments: string[] = [];
  const seen = new WeakSet<object>();
  let total = 0;
  let truncated = false;

  const pushSegment = (segment: string): void => {
    if (!segment) {
      return;
    }
    const remaining = policy.maxContentChars - total;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    if (segment.length > remaining) {
      segments.push(segment.slice(0, remaining));
      total += remaining;
      truncated = true;
      return;
    }
    segments.push(segment);
    total += segment.length;
  };

  const shouldStop = (depth: number): boolean => {
    if (total >= policy.maxContentChars || depth > policy.maxDepth) {
      truncated = true;
      return true;
    }
    return false;
  };

  const handlePrimitive = (input: unknown): boolean => {
    if (typeof input === "string") {
      pushSegment(input);
      return true;
    }
    if (typeof input === "number" || typeof input === "boolean") {
      pushSegment(String(input));
      return true;
    }
    if (input === null || input === undefined) {
      return true;
    }
    return false;
  };

  const walkArray = (items: unknown[], depth: number): void => {
    for (const item of items) {
      walk(item, depth + 1);
      if (total >= policy.maxContentChars) {
        return;
      }
    }
  };

  const walkObject = (input: Record<string, unknown>, depth: number): void => {
    if (seen.has(input)) {
      return;
    }
    seen.add(input);
    for (const value of Object.values(input)) {
      walk(value, depth + 1);
      if (total >= policy.maxContentChars) {
        return;
      }
    }
  };

  const walk = (input: unknown, depth: number): void => {
    if (shouldStop(depth)) {
      return;
    }
    if (handlePrimitive(input)) {
      return;
    }
    if (Array.isArray(input)) {
      walkArray(input, depth);
      return;
    }
    if (typeof input === "object") {
      walkObject(input as Record<string, unknown>, depth);
    }
  };

  walk(value, 0);
  return { text: segments.join("\n"), truncated };
}

function collectToolContent(
  content: ToolContent[],
  policy: PromptInjectionPolicy
): { text: string; truncated: boolean } {
  const segments: string[] = [];
  const maxChars = policy.maxContentChars;
  let total = 0;
  let truncated = false;

  const pushSegment = (segment: string): void => {
    if (!segment) {
      return;
    }
    const remaining = maxChars - total;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    if (segment.length > remaining) {
      segments.push(segment.slice(0, remaining));
      total += remaining;
      truncated = true;
      return;
    }
    segments.push(segment);
    total += segment.length;
  };

  for (const entry of content) {
    if (entry.type === "text") {
      pushSegment(entry.text);
    } else if (entry.type === "resource") {
      pushSegment(entry.uri);
    }
    if (total >= maxChars) {
      break;
    }
  }

  return { text: segments.join("\n"), truncated };
}
