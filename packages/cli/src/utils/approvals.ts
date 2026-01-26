import type { ConfirmationHandler, ConfirmationRequest } from "@ku0/agent-runtime-core";
import { writeStdout } from "./terminal";

export type ApprovalMode = "ask" | "auto" | "deny";

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
