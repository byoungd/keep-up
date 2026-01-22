/**
 * Code Agent Orchestrator Factory
 *
 * Wires SOP enforcement, artifact-backed quality gates, and planning defaults.
 */

import {
  type ArtifactRegistry,
  createArtifactPipeline,
  createArtifactRegistry,
} from "@ku0/agent-runtime-persistence/artifacts";
import type { IToolRegistry } from "@ku0/agent-runtime-tools";
import {
  CODER_SOP,
  createCodeAgentGateChecker,
  createSOPExecutor,
  type GateChecker,
  type ISOPExecutor,
  type RoleDefinition,
} from "../sop";
import { createTaskGraphStore } from "../tasks/taskGraph";
import {
  type CreateOrchestratorOptions,
  createOrchestrator,
  type IAgentLLM,
  type OrchestratorComponents,
} from "./orchestrator";

export interface CreateCodeAgentOrchestratorOptions extends CreateOrchestratorOptions {
  artifactRegistry?: ArtifactRegistry;
  gateChecker?: GateChecker;
  sopDefinition?: RoleDefinition;
  sopExecutor?: ISOPExecutor;
}

export function createCodeAgentOrchestrator(
  llm: IAgentLLM,
  registry: IToolRegistry,
  options: CreateCodeAgentOrchestratorOptions = {}
) {
  const {
    components,
    planning,
    artifactRegistry,
    gateChecker,
    sopDefinition,
    sopExecutor,
    eventBus,
    name,
    ...rest
  } = options;

  const resolvedEventBus = eventBus ?? components?.eventBus;
  const taskGraph = components?.taskGraph ?? createTaskGraphStore();
  const resolvedRegistry =
    artifactRegistry ?? (components?.artifactPipeline ? undefined : createArtifactRegistry());
  const resolvedGateChecker =
    gateChecker ??
    (resolvedRegistry ? createCodeAgentGateChecker({ artifacts: resolvedRegistry }) : undefined);
  const resolvedSopExecutor =
    sopExecutor ??
    components?.sopExecutor ??
    (resolvedGateChecker
      ? createSOPExecutor(sopDefinition ?? CODER_SOP, resolvedGateChecker)
      : undefined);

  if (!resolvedSopExecutor) {
    throw new Error(
      "createCodeAgentOrchestrator requires a sopExecutor or a gateChecker with artifactRegistry."
    );
  }

  const artifactPipeline =
    components?.artifactPipeline ??
    createArtifactPipeline({
      registry: resolvedRegistry ?? createArtifactRegistry(),
      taskGraph,
      eventBus: resolvedEventBus,
      eventSource: name ?? "code-agent",
    });

  const mergedComponents: OrchestratorComponents = {
    ...components,
    taskGraph,
    eventBus: resolvedEventBus,
    artifactPipeline,
    sopExecutor: resolvedSopExecutor,
  };

  return createOrchestrator(llm, registry, {
    ...rest,
    name,
    eventBus: resolvedEventBus,
    planning: { enabled: true, persistToFile: false, ...planning },
    components: mergedComponents,
  });
}
