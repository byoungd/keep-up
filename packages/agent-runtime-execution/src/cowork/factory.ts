/**
 * Cowork Runtime Factories
 *
 * Helpers for wiring Cowork policy, permission checking, and orchestrator setup.
 */

import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type { IToolRegistry, SkillRegistry } from "@ku0/agent-runtime-tools";
import { createSkillPolicyGuard } from "@ku0/agent-runtime-tools";
import type { ToolExecutionOptions } from "../executor";
import { createToolExecutor } from "../executor";
import type { AgentModeManager } from "../modes";
import { createModePolicyEngine } from "../modes";
import type { IAgentLLM, OrchestratorComponents } from "../orchestrator/orchestrator";
import { type CreateOrchestratorOptions, createOrchestrator } from "../orchestrator/orchestrator";
import {
  createPermissionChecker,
  createSecurityPolicy,
  createToolGovernancePolicyEngine,
  createToolPolicyEngine,
  type IPermissionChecker,
  resolveToolExecutionContext,
  type ToolPolicyEngine,
} from "../security";
import type {
  AuditLogger,
  CoworkToolContext,
  SecurityPolicy,
  ToolExecutionContext,
} from "../types";
import { DEFAULT_COWORK_POLICY } from "./defaultPolicy";
import { CoworkPermissionChecker } from "./permissionChecker";
import {
  type CoworkPolicyConfig,
  CoworkPolicyEngine,
  type CoworkPolicyEngineOptions,
} from "./policy";
import { createCoworkSessionState } from "./sessionState";
import type { CoworkSession } from "./types";

export interface CoworkRuntimeConfig {
  session: CoworkSession;
  policy?: CoworkPolicyConfig;
  policyEngine?: CoworkPolicyEngine;
  baseChecker?: IPermissionChecker;
  securityPolicy?: SecurityPolicy;
  caseInsensitivePaths?: boolean;
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  modeManager?: AgentModeManager;
  toolExecutionContext?: Partial<ToolExecutionContext>;
}

export interface CreateCoworkOrchestratorOptions
  extends Omit<CreateOrchestratorOptions, "toolExecution"> {
  cowork: CoworkRuntimeConfig;
  toolExecution?: ToolExecutionOptions;
}

export function createCoworkPolicyEngine(
  config?: CoworkPolicyConfig,
  options?: CoworkPolicyEngineOptions
): CoworkPolicyEngine {
  return new CoworkPolicyEngine(config ?? DEFAULT_COWORK_POLICY, options);
}

export function createCoworkPermissionChecker(
  config: CoworkRuntimeConfig
): CoworkPermissionChecker {
  const policyEngine = resolveCoworkPolicyEngine(config);
  const baseChecker =
    config.baseChecker ??
    createPermissionChecker(config.securityPolicy ?? createSecurityPolicy("balanced"));

  return new CoworkPermissionChecker({
    session: config.session,
    policyEngine,
    baseChecker,
    caseInsensitivePaths: config.caseInsensitivePaths,
  });
}

export interface CoworkToolExecutorConfig
  extends CoworkRuntimeConfig,
    Omit<ToolExecutionOptions, "policy" | "policyEngine"> {
  skillRegistry?: SkillRegistry;
}

export function createCoworkToolExecutor(
  registry: IToolRegistry,
  config: CoworkToolExecutorConfig
): ReturnType<typeof createToolExecutor> {
  const coworkPolicyEngine = resolveCoworkPolicyEngine(config);
  const policy = createCoworkPermissionChecker({ ...config, policyEngine: coworkPolicyEngine });
  const coworkContext = buildCoworkContext(config, coworkPolicyEngine);
  const toolPolicyEngine = resolveToolPolicyEngine(
    policy,
    config.modeManager,
    undefined,
    config.toolExecutionContext
  );
  const policyEngine = config.skillRegistry
    ? createSkillPolicyGuard(toolPolicyEngine, config.skillRegistry)
    : toolPolicyEngine;

  return createToolExecutor({
    registry,
    policy,
    policyEngine,
    promptInjectionGuard: config.promptInjectionGuard,
    promptInjectionPolicy: config.promptInjectionPolicy,
    sandboxAdapter: config.sandboxAdapter,
    telemetryHandler: config.telemetryHandler,
    executionObserver: config.executionObserver,
    audit: config.audit,
    telemetry: config.telemetry,
    rateLimiter: config.rateLimiter,
    cache: config.cache,
    retryOptions: config.retryOptions,
    cachePredicate: config.cachePredicate,
    contextOverrides: mergeContextOverrides(config.contextOverrides, coworkContext),
    outputSpooler: config.outputSpooler,
    outputSpoolPolicy: config.outputSpoolPolicy,
    outputSpoolingEnabled: config.outputSpoolingEnabled,
    imageArtifactStore: config.imageArtifactStore,
  });
}

export function createCoworkOrchestrator(
  llm: IAgentLLM,
  registry: IToolRegistry,
  options: CreateCoworkOrchestratorOptions
) {
  const { cowork, toolExecution, components, toolExecutionContext, ...rest } = options;
  const coworkPolicyEngine = resolveCoworkPolicyEngine(cowork);
  const policy = createCoworkPermissionChecker({ ...cowork, policyEngine: coworkPolicyEngine });
  const coworkContext = buildCoworkContext(cowork, coworkPolicyEngine);
  const baseToolPolicyEngine = toolExecution?.policyEngine ?? createToolPolicyEngine(policy);
  const toolPolicyEngine = resolveToolPolicyEngine(
    policy,
    cowork.modeManager,
    baseToolPolicyEngine,
    cowork.toolExecutionContext
  );
  const coworkToolExecution: ToolExecutionOptions = {
    ...toolExecution,
    policy,
    policyEngine: toolPolicyEngine,
    audit: toolExecution?.audit ?? cowork.audit,
    telemetry: toolExecution?.telemetry ?? cowork.telemetry,
    contextOverrides: mergeContextOverrides(toolExecution?.contextOverrides, coworkContext),
  };
  const sanitizedComponents: OrchestratorComponents = components
    ? { ...components, toolExecutor: undefined }
    : {};
  if (!sanitizedComponents.sessionState) {
    sanitizedComponents.sessionState = createCoworkSessionState();
  }

  return createOrchestrator(llm, registry, {
    ...rest,
    components: sanitizedComponents,
    toolExecution: coworkToolExecution,
    toolExecutionContext: toolExecutionContext ?? cowork.toolExecutionContext,
  });
}

function resolveCoworkPolicyEngine(config: CoworkRuntimeConfig): CoworkPolicyEngine {
  return (
    config.policyEngine ?? createCoworkPolicyEngine(config.policy, { telemetry: config.telemetry })
  );
}

function resolveToolPolicyEngine(
  policy: IPermissionChecker,
  modeManager?: AgentModeManager,
  basePolicyEngine?: ToolPolicyEngine,
  toolExecutionContext?: Partial<ToolExecutionContext>
): ToolPolicyEngine {
  const engine = basePolicyEngine ?? createToolPolicyEngine(policy);
  const modeEngine = modeManager ? createModePolicyEngine(modeManager, engine) : engine;
  const resolvedContext = resolveToolExecutionContext(toolExecutionContext, policy.getPolicy());
  return createToolGovernancePolicyEngine(modeEngine, resolvedContext);
}

function buildCoworkContext(
  config: CoworkRuntimeConfig,
  policyEngine: CoworkPolicyEngine
): CoworkToolContext {
  return {
    session: config.session,
    policyEngine,
    caseInsensitivePaths: config.caseInsensitivePaths,
  };
}

function mergeContextOverrides(
  overrides: ToolExecutionOptions["contextOverrides"],
  coworkContext: CoworkToolContext
): ToolExecutionOptions["contextOverrides"] {
  return { ...overrides, cowork: coworkContext };
}
