import type { ConfirmationHandler, ConfirmationRequest } from "@ku0/agent-runtime-core";
import { type ApprovalPolicy, AutoApprover } from "@ku0/agent-runtime-tools";
import { writeStdout } from "./terminal";

export type ApprovalMode = "ask" | "auto" | "deny";

export interface AutoApprovalOptions {
  policies: ApprovalPolicy[];
  workspacePaths: string[];
}

export function resolveApprovalMode(
  primary: string | undefined,
  fallback: unknown,
  envVar?: string
): ApprovalMode {
  const normalized = normalizeMode(primary);
  if (normalized) {
    return normalized;
  }
  const envValue = envVar ? normalizeMode(process.env[envVar]) : undefined;
  if (envValue) {
    return envValue;
  }
  const fallbackValue = typeof fallback === "string" ? normalizeMode(fallback) : undefined;
  return fallbackValue ?? "ask";
}

export function createConfirmationHandler(options: {
  mode: ApprovalMode;
  ask?: (prompt: string) => Promise<string>;
  quiet?: boolean;
  autoApproval?: AutoApprovalOptions;
}): ConfirmationHandler | undefined {
  const baseHandler = buildBaseHandler(options);
  if (!options.autoApproval || options.autoApproval.policies.length === 0) {
    return baseHandler;
  }

  const approver = new AutoApprover({ policies: options.autoApproval.policies });
  const workspacePaths = options.autoApproval.workspacePaths;

  return async (request: ConfirmationRequest) => {
    const decision = approver.shouldAutoApprove(request.toolName, request.arguments, {
      workspacePaths,
    });
    if (!decision.requiresUserConfirmation) {
      return decision.approved;
    }

    if (!baseHandler) {
      return false;
    }
    return baseHandler(request);
  };
}

export function resolveAutoApprovalOptions(input: {
  policies?: unknown;
  workspacePaths?: unknown;
}): AutoApprovalOptions | undefined {
  const policies = Array.isArray(input.policies) ? input.policies.filter(isApprovalPolicy) : [];
  if (policies.length === 0) {
    return undefined;
  }
  const workspacePaths = normalizeWorkspacePaths(input.workspacePaths);
  return { policies, workspacePaths };
}

function buildBaseHandler(options: {
  mode: ApprovalMode;
  ask?: (prompt: string) => Promise<string>;
  quiet?: boolean;
}): ConfirmationHandler | undefined {
  if (options.mode === "auto") {
    return async () => true;
  }
  if (options.mode === "deny") {
    return async () => false;
  }
  const ask = options.ask;
  if (!ask) {
    return async () => false;
  }
  return async (request: ConfirmationRequest) => {
    if (!options.quiet) {
      writeStdout(formatApprovalDetails(request));
    }
    const answer = await ask(`Approve ${request.toolName}? [y/N]: `);
    return answer.toLowerCase().startsWith("y");
  };
}

function normalizeWorkspacePaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [process.cwd()];
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [process.cwd()];
}

function isApprovalPolicy(value: unknown): value is ApprovalPolicy {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  const name = record.name;
  const tools = record.tools;
  const action = record.action;
  const priority = record.priority;
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }
  if (!Array.isArray(tools) || !tools.every((tool) => typeof tool === "string")) {
    return false;
  }
  if (action !== "approve" && action !== "deny" && action !== "ask") {
    return false;
  }
  if (typeof priority !== "number" || Number.isNaN(priority)) {
    return false;
  }
  return true;
}

function normalizeMode(value: string | undefined): ApprovalMode | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "ask" || trimmed === "auto" || trimmed === "deny") {
    return trimmed as ApprovalMode;
  }
  return undefined;
}

function formatApprovalDetails(request: ConfirmationRequest): string {
  const risk = request.risk ? `Risk: ${request.risk}` : "Risk: unknown";
  const reason = request.reason ? `Reason: ${request.reason}` : "";
  return ["\nApproval required", `Tool: ${request.toolName}`, risk, reason]
    .filter(Boolean)
    .join("\n");
}
