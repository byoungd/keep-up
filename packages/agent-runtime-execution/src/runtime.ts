/**
 * Runtime Composition Root
 *
 * Provides explicit wiring for the agent runtime using dependency injection.
 */

import {
  createMessageBus,
  getGlobalEventBus,
  type RuntimeEventBus,
} from "@ku0/agent-runtime-control";
import { type PersistenceStore, PersistentAuditLogger } from "@ku0/agent-runtime-persistence";
import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type {
  IToolRegistry,
  SkillPromptAdapter,
  SkillRegistry,
  SkillSession,
} from "@ku0/agent-runtime-tools";
import { createToolRegistry } from "@ku0/agent-runtime-tools";
import { createFileContextTracker, type FileContextTracker } from "./context";
import type { ToolExecutor } from "./executor";
import { createKernel, type Kernel, type KernelConfig, type RuntimeServices } from "./kernel";
import type { IAgentLLM } from "./orchestrator/llmTypes";
import type { IPermissionChecker } from "./security";
import { createPermissionChecker, createSecurityPolicy, withAuditTelemetry } from "./security";
import type { SessionState } from "./session";
import type {
  AuditLogger,
  ICheckpointManager,
  MCPToolServer,
  RuntimeMessageBus,
  SecurityPolicy,
  SecurityPreset,
} from "./types";

export interface RuntimeComponents {
  llm: IAgentLLM;
  registry?: IToolRegistry;
  toolServers?: MCPToolServer[];
  permissionChecker?: IPermissionChecker;
  security?: SecurityPolicy | SecurityPreset;
  auditLogger?: AuditLogger;
  persistenceStore?: PersistenceStore;
  telemetry?: TelemetryContext;
  eventBus?: RuntimeEventBus;
  messageBus?: RuntimeMessageBus;
  sessionState?: SessionState;
  checkpointManager?: ICheckpointManager;
  fileContextTracker?: FileContextTracker;
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
  messageBus?: RuntimeMessageBus;
  sessionState?: SessionState;
  checkpointManager?: ICheckpointManager;
  fileContextTracker?: FileContextTracker;
  persistenceStore?: PersistenceStore;
}

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeInstance> {
  const components = options.components;
  const registry = components.registry ?? createToolRegistry();
  const eventBus = components.eventBus ?? getGlobalEventBus();
  const messageBus = components.messageBus ?? createMessageBus(eventBus);
  const persistenceStore = components.persistenceStore;
  const baseAuditLogger = persistenceStore
    ? new PersistentAuditLogger(persistenceStore, components.auditLogger)
    : components.auditLogger;
  const resolvedAuditLogger = baseAuditLogger
    ? withAuditTelemetry(baseAuditLogger, {
        eventBus,
        telemetry: components.telemetry,
        source: "audit:runtime",
      })
    : undefined;

  if (components.toolServers?.length) {
    for (const server of components.toolServers) {
      await registry.register(server);
    }
  } else if (!components.registry) {
    throw new Error("createRuntime requires toolServers when registry is not provided");
  }

  const resolvedSecurity = resolveSecurityPolicy(components.security);
  const permissionChecker =
    components.permissionChecker ?? createPermissionChecker(resolvedSecurity);
  const fileContextTracker =
    components.fileContextTracker ??
    (resolvedSecurity.sandbox.workingDirectory
      ? createFileContextTracker({
          workspacePath: resolvedSecurity.sandbox.workingDirectory,
          eventBus,
        })
      : undefined);

  const services: RuntimeServices = {
    llm: components.llm,
    registry,
    executor: components.toolExecutor,
    policy: permissionChecker,
    events: eventBus,
    messageBus,
    state: components.sessionState,
    checkpointManager: components.checkpointManager,
    fileContextTracker,
    audit: resolvedAuditLogger,
    persistenceStore,
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
    auditLogger: resolvedAuditLogger,
    telemetry: components.telemetry,
    eventBus,
    messageBus,
    sessionState: components.sessionState,
    checkpointManager: components.checkpointManager,
    fileContextTracker,
    persistenceStore,
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
