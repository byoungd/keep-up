/**
 * Runtime Composition Root
 *
 * Provides explicit wiring for the agent runtime using dependency injection.
 */

import type { RuntimeEventBus } from "./events/eventBus";
import type { ToolExecutor } from "./executor";
import { createKernel, type Kernel, type KernelConfig, type RuntimeServices } from "./kernel";
import type { IAgentLLM } from "./orchestrator/llmTypes";
import type { IPermissionChecker } from "./security";
import { createPermissionChecker, createSecurityPolicy } from "./security";
import type { SessionState } from "./session";
import type { SkillPromptAdapter, SkillRegistry, SkillSession } from "./skills";
import type { TelemetryContext } from "./telemetry";
import { createToolRegistry, type IToolRegistry } from "./tools/mcp/registry";
import type { AuditLogger, MCPToolServer, SecurityPolicy, SecurityPreset } from "./types";

export interface RuntimeComponents {
  llm: IAgentLLM;
  registry?: IToolRegistry;
  toolServers?: MCPToolServer[];
  permissionChecker?: IPermissionChecker;
  security?: SecurityPolicy | SecurityPreset;
  auditLogger?: AuditLogger;
  telemetry?: TelemetryContext;
  eventBus?: RuntimeEventBus;
  sessionState?: SessionState;
  toolExecutor?: ToolExecutor;
  skillRegistry?: SkillRegistry;
  skillSession?: SkillSession;
  skillPromptAdapter?: SkillPromptAdapter;
  clock?: RuntimeServices["clock"];
  ids?: RuntimeServices["ids"];
}

export interface CreateRuntimeOptions {
  components: RuntimeComponents;
  kernel?: KernelConfig;
  orchestrator?: KernelConfig["orchestrator"];
}

export interface RuntimeInstance {
  kernel: Kernel;
  registry: IToolRegistry;
  permissionChecker: IPermissionChecker;
  auditLogger?: AuditLogger;
  telemetry?: TelemetryContext;
  eventBus?: RuntimeEventBus;
  sessionState?: SessionState;
}

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeInstance> {
  const components = options.components;
  const registry = components.registry ?? createToolRegistry();

  if (components.toolServers?.length) {
    for (const server of components.toolServers) {
      await registry.register(server);
    }
  } else if (!components.registry) {
    throw new Error("createRuntime requires toolServers when registry is not provided");
  }

  const permissionChecker =
    components.permissionChecker ??
    createPermissionChecker(resolveSecurityPolicy(components.security));

  const services: RuntimeServices = {
    llm: components.llm,
    registry,
    executor: components.toolExecutor,
    policy: permissionChecker,
    events: components.eventBus,
    state: components.sessionState,
    audit: components.auditLogger,
    telemetry: components.telemetry,
    clock: components.clock,
    ids: components.ids,
  };

  const kernelConfig: KernelConfig = {
    ...options.kernel,
    orchestrator: options.orchestrator ?? options.kernel?.orchestrator,
    skills:
      options.kernel?.skills ??
      (components.skillRegistry
        ? {
            registry: components.skillRegistry,
            session: components.skillSession,
            promptAdapter: components.skillPromptAdapter,
          }
        : undefined),
  };

  return {
    kernel: createKernel(services, kernelConfig),
    registry,
    permissionChecker,
    auditLogger: components.auditLogger,
    telemetry: components.telemetry,
    eventBus: components.eventBus,
    sessionState: components.sessionState,
  };
}

function resolveSecurityPolicy(security?: SecurityPolicy | SecurityPreset): SecurityPolicy {
  if (!security) {
    return createSecurityPolicy("balanced");
  }
  if (typeof security === "string") {
    return createSecurityPolicy(security);
  }
  return security;
}
