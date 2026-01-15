/**
 * Cowork Runtime Factories
 *
 * Helpers for wiring Cowork policy, permission checking, and orchestrator setup.
 */

import type { ToolExecutionOptions } from "../executor";
import { createToolExecutor } from "../executor";
import type { IAgentLLM, OrchestratorComponents } from "../orchestrator/orchestrator";
import { type CreateOrchestratorOptions, createOrchestrator } from "../orchestrator/orchestrator";
import {
  type IPermissionChecker,
  createPermissionChecker,
  createSecurityPolicy,
} from "../security";
import type { TelemetryContext } from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type { AuditLogger, CoworkToolContext, SecurityPolicy } from "../types";
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
    Omit<ToolExecutionOptions, "policy" | "policyEngine"> {}

export function createCoworkToolExecutor(
  registry: IToolRegistry,
  config: CoworkToolExecutorConfig
): ReturnType<typeof createToolExecutor> {
  const policyEngine = resolveCoworkPolicyEngine(config);
  const policy = createCoworkPermissionChecker({ ...config, policyEngine });
  const coworkContext = buildCoworkContext(config, policyEngine);

  return createToolExecutor({
    registry,
    policy,
    sandboxAdapter: config.sandboxAdapter,
    telemetryHandler: config.telemetryHandler,
    audit: config.audit,
    telemetry: config.telemetry,
    rateLimiter: config.rateLimiter,
    cache: config.cache,
    retryOptions: config.retryOptions,
    cachePredicate: config.cachePredicate,
    contextOverrides: mergeContextOverrides(config.contextOverrides, coworkContext),
  });
}

export function createCoworkOrchestrator(
  llm: IAgentLLM,
  registry: IToolRegistry,
  options: CreateCoworkOrchestratorOptions
) {
  const { cowork, toolExecution, components, ...rest } = options;
  const policyEngine = resolveCoworkPolicyEngine(cowork);
  const policy = createCoworkPermissionChecker({ ...cowork, policyEngine });
  const coworkContext = buildCoworkContext(cowork, policyEngine);
  const coworkToolExecution: ToolExecutionOptions = {
    ...toolExecution,
    policy,
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
  });
}

function resolveCoworkPolicyEngine(config: CoworkRuntimeConfig): CoworkPolicyEngine {
  return (
    config.policyEngine ?? createCoworkPolicyEngine(config.policy, { telemetry: config.telemetry })
  );
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
