/**
 * Execution Sandbox Adapter
 *
 * Provides a standardized preflight/postflight interface for tool execution.
 */

export * from "@ku0/agent-runtime-sandbox";

import {
  createSandbox as createRustSandbox,
  SandboxManager as RustSandboxManager,
  type SandboxPolicy as RustSandboxPolicy,
  type SandboxPolicyConfig as RustSandboxPolicyConfig,
  WORKSPACE_POLICY,
} from "@ku0/sandbox-rs";
import { type CoworkFileIntent, CoworkSandboxAdapter } from "../cowork/sandbox";
import type { MCPToolCall, MCPToolResult, SandboxConfig, ToolContext } from "../types";

export interface ExecutionSandboxDecision {
  allowed: boolean;
  sandboxed: boolean;
  reason?: string;
  riskTags?: string[];
  affectedPaths?: string[];
}

export interface ToolExecutionTelemetry {
  toolName: string;
  command?: string;
  durationMs: number;
  exitCode?: number;
  affectedPaths?: string[];
  sandboxed: boolean;
}

export interface ExecutionSandboxAdapter {
  preflight(call: MCPToolCall, context: ToolContext): ExecutionSandboxDecision;
  postflight(
    call: MCPToolCall,
    context: ToolContext,
    result: MCPToolResult,
    durationMs: number
  ): ToolExecutionTelemetry;
}

export class DefaultExecutionSandboxAdapter implements ExecutionSandboxAdapter {
  preflight(call: MCPToolCall, context: ToolContext): ExecutionSandboxDecision {
    const sandboxed = context.security.sandbox.type !== "none";
    const affectedPaths = extractAffectedPaths(call);

    if (context.cowork) {
      const sandbox = new CoworkSandboxAdapter(context.cowork.policyEngine);
      const operation = parseOperation(call.name);
      const intent = resolveFileIntent(operation);

      if (intent && affectedPaths.length > 0) {
        return evaluateCoworkFileActions({
          sandbox,
          context,
          session: context.cowork.session,
          intent,
          affectedPaths,
        });
      }

      const host = extractHost(call);
      if (host) {
        const decision = sandbox.evaluateNetworkAction({
          session: context.cowork.session,
          host,
          hostAllowlist: context.security.sandbox.allowedHosts,
        });

        return {
          allowed: decision.decision !== "deny",
          sandboxed: true,
          reason: decision.reason,
          riskTags: decision.riskTags,
          affectedPaths,
        };
      }

      const connectorAllowed = resolveConnectorAllowed(call, context);
      if (connectorAllowed !== null) {
        const decision = sandbox.evaluateConnectorAction({
          session: context.cowork.session,
          connectorScopeAllowed: connectorAllowed,
        });

        return {
          allowed: decision.decision !== "deny",
          sandboxed: true,
          reason: decision.reason,
          riskTags: decision.riskTags,
          affectedPaths,
        };
      }
    }

    return {
      allowed: true,
      sandboxed,
      affectedPaths,
    };
  }

  postflight(
    call: MCPToolCall,
    context: ToolContext,
    result: MCPToolResult,
    durationMs: number
  ): ToolExecutionTelemetry {
    return {
      toolName: call.name,
      command: extractCommand(call),
      durationMs,
      exitCode: result.success ? 0 : 1,
      affectedPaths: extractAffectedPaths(call),
      sandboxed: context.security.sandbox.type !== "none",
    };
  }
}

export function createExecutionSandboxAdapter(): ExecutionSandboxAdapter {
  return new DefaultExecutionSandboxAdapter();
}

export function createSandbox(config: SandboxConfig): RustSandboxPolicy | null {
  if (config.type !== "rust") {
    return null;
  }
  return createRustSandbox(config);
}

export function createRustSandboxManager(config: SandboxConfig): RustSandboxManager | null {
  if (config.type !== "rust") {
    return null;
  }
  const workingDirectory = config.workingDirectory ?? process.cwd();
  const policy = buildRustSandboxPolicy(config, workingDirectory);

  try {
    return new RustSandboxManager(policy, workingDirectory);
  } catch {
    return null;
  }
}

export type { RustSandboxPolicyConfig };
export { RustSandboxManager };

function buildRustSandboxPolicy(
  config: SandboxConfig,
  workingDirectory: string
): RustSandboxPolicyConfig {
  const allowlist = config.networkAccess === "allowlist";
  const fullAccess = config.networkAccess === "full";
  const filesystemMode =
    config.fsIsolation === "workspace" || config.fsIsolation === "temp"
      ? "workspace"
      : "permissive";
  const allowedDomains = allowlist ? (config.allowedHosts ?? []) : undefined;

  return {
    ...WORKSPACE_POLICY,
    name: filesystemMode,
    filesystem: {
      ...WORKSPACE_POLICY.filesystem,
      mode: filesystemMode,
      allowedPaths: workingDirectory ? [workingDirectory] : [],
    },
    network: {
      ...WORKSPACE_POLICY.network,
      enabled: config.networkAccess !== "none",
      allowedDomains,
      allowLocalhost: fullAccess,
      allowHttps: fullAccess || allowlist,
      allowHttp: fullAccess,
    },
  };
}

function parseOperation(name: string): string {
  const parts = name.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : name;
}

function resolveFileIntent(operation: string): CoworkFileIntent | null {
  switch (operation) {
    case "read":
    case "list":
    case "info":
      return "read";
    case "write":
      return "write";
    case "create":
      return "create";
    case "delete":
      return "delete";
    case "rename":
      return "rename";
    case "move":
      return "move";
    default:
      return null;
  }
}

function evaluateCoworkFileActions(input: {
  sandbox: CoworkSandboxAdapter;
  context: ToolContext;
  session: NonNullable<ToolContext["cowork"]>["session"];
  intent: CoworkFileIntent;
  affectedPaths: string[];
}): ExecutionSandboxDecision {
  const riskTags = new Set<string>();

  for (const path of input.affectedPaths) {
    const decision = input.sandbox.evaluateFileAction({
      session: input.session,
      path,
      intent: input.intent,
      caseInsensitivePaths: input.context.cowork?.caseInsensitivePaths,
    });

    if (decision.riskTags) {
      for (const tag of decision.riskTags) {
        riskTags.add(tag);
      }
    }

    if (decision.decision === "deny") {
      return {
        allowed: false,
        sandboxed: true,
        reason: decision.reason,
        riskTags: decision.riskTags,
        affectedPaths: input.affectedPaths,
      };
    }
  }

  return {
    allowed: true,
    sandboxed: true,
    affectedPaths: input.affectedPaths,
    riskTags: riskTags.size > 0 ? Array.from(riskTags) : undefined,
  };
}

function extractAffectedPaths(call: MCPToolCall): string[] {
  const args = call.arguments as Record<string, unknown>;
  const paths: string[] = [];

  if (typeof args.path === "string") {
    paths.push(args.path);
  }
  if (Array.isArray(args.paths)) {
    for (const entry of args.paths) {
      if (typeof entry === "string") {
        paths.push(entry);
      }
    }
  }
  if (typeof args.srcPath === "string") {
    paths.push(args.srcPath);
  }
  if (typeof args.destPath === "string") {
    paths.push(args.destPath);
  }
  if (typeof args.from === "string") {
    paths.push(args.from);
  }
  if (typeof args.to === "string") {
    paths.push(args.to);
  }

  return paths;
}

function extractHost(call: MCPToolCall): string | null {
  const args = call.arguments as Record<string, unknown>;
  if (typeof args.host === "string") {
    return args.host;
  }
  if (typeof args.url === "string") {
    try {
      return new URL(args.url).host;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveConnectorAllowed(call: MCPToolCall, context: ToolContext): boolean | null {
  const args = call.arguments as Record<string, unknown>;
  const connectorId =
    typeof args.connectorId === "string"
      ? args.connectorId
      : typeof args.connector === "string"
        ? args.connector
        : null;

  if (!connectorId || !context.cowork) {
    return null;
  }

  return context.cowork.session.connectors.some(
    (connector) => connector.id === connectorId && connector.allowActions
  );
}

function extractCommand(call: MCPToolCall): string | undefined {
  const args = call.arguments as Record<string, unknown>;
  if (typeof args.command === "string") {
    return args.command;
  }
  if (typeof args.cmd === "string") {
    return args.cmd;
  }
  return undefined;
}
