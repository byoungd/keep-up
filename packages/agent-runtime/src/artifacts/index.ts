/**
 * Artifact Registry
 *
 * Stores structured artifacts and validates payloads before emission.
 */

import { z } from "zod";
import type { RuntimeEventBus } from "../events/eventBus";
import type { TaskGraphStore } from "../tasks/taskGraph";
import type { ArtifactEnvelope, ArtifactType } from "../types";

export interface ArtifactValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ArtifactSchema {
  type: ArtifactType;
  version: string;
  validate(payload: Record<string, unknown>): ArtifactValidationResult;
}

export interface ArtifactStoreResult extends ArtifactValidationResult {
  stored: boolean;
}

export interface QuarantinedArtifact {
  artifact: ArtifactEnvelope;
  errors: string[];
}

export type { ArtifactEnvelope, ArtifactType };

export class ArtifactRegistry {
  private readonly schemas = new Map<string, ArtifactSchema>();
  private readonly artifacts = new Map<string, ArtifactEnvelope>();
  private readonly quarantined: QuarantinedArtifact[] = [];

  registerSchema(schema: ArtifactSchema): void {
    this.schemas.set(this.schemaKey(schema.type, schema.version), schema);
  }

  validate(artifact: ArtifactEnvelope): ArtifactValidationResult {
    const schema = this.schemas.get(this.schemaKey(artifact.type, artifact.schemaVersion));
    if (!schema) {
      return {
        valid: false,
        errors: [`Missing schema for ${artifact.type}@${artifact.schemaVersion}`],
      };
    }

    return schema.validate(artifact.payload);
  }

  store(artifact: ArtifactEnvelope): ArtifactStoreResult {
    const validation = this.validate(artifact);
    if (!validation.valid) {
      this.quarantined.push({
        artifact,
        errors: validation.errors ?? ["Unknown validation error"],
      });
      return { stored: false, ...validation };
    }

    this.artifacts.set(artifact.id, artifact);
    return { stored: true, valid: true };
  }

  get(id: string): ArtifactEnvelope | undefined {
    return this.artifacts.get(id);
  }

  list(): ArtifactEnvelope[] {
    return Array.from(this.artifacts.values());
  }

  listQuarantined(): QuarantinedArtifact[] {
    return [...this.quarantined];
  }

  private schemaKey(type: ArtifactType, version: string): string {
    return `${type}@${version}`;
  }
}

export interface ArtifactEmissionContext {
  correlationId?: string;
  source?: string;
  idempotencyKey?: string;
}

export interface ArtifactEmissionResult extends ArtifactStoreResult {
  artifactNodeId?: string;
}

export interface ArtifactPipelineConfig {
  registry: ArtifactRegistry;
  taskGraph?: TaskGraphStore;
  eventBus?: RuntimeEventBus;
  eventSource?: string;
}

export class ArtifactPipeline {
  private readonly registry: ArtifactRegistry;
  private readonly taskGraph?: TaskGraphStore;
  private readonly eventBus?: RuntimeEventBus;
  private readonly eventSource?: string;

  constructor(config: ArtifactPipelineConfig) {
    this.registry = config.registry;
    this.taskGraph = config.taskGraph;
    this.eventBus = config.eventBus;
    this.eventSource = config.eventSource;
  }

  emit(artifact: ArtifactEnvelope, context: ArtifactEmissionContext = {}): ArtifactEmissionResult {
    const result = this.registry.store(artifact);
    const artifactNodeId = this.recordTaskGraph(artifact, result, context);
    this.emitEventBus(artifact, result, artifactNodeId, context);

    return { ...result, artifactNodeId };
  }

  private recordTaskGraph(
    artifact: ArtifactEnvelope,
    result: ArtifactStoreResult,
    context: ArtifactEmissionContext
  ): string | undefined {
    if (!this.taskGraph) {
      return undefined;
    }

    const status = result.stored ? "completed" : "failed";
    const node = this.taskGraph.createNode({
      type: "artifact",
      title: artifact.title,
      status,
      dependsOn: artifact.taskNodeId ? [artifact.taskNodeId] : undefined,
      artifactId: artifact.id,
    });

    try {
      this.taskGraph.recordNodeEvent(
        node.id,
        "artifact_emitted",
        {
          artifact,
          stored: result.stored,
          valid: result.valid,
          errors: result.errors,
        },
        {
          correlationId: context.correlationId,
          source: context.source,
          idempotencyKey: context.idempotencyKey ?? artifact.id,
        }
      );
    } catch {
      // Avoid breaking artifact emission on task graph errors.
    }

    return node.id;
  }

  private emitEventBus(
    artifact: ArtifactEnvelope,
    result: ArtifactStoreResult,
    artifactNodeId: string | undefined,
    context: ArtifactEmissionContext
  ): void {
    if (!this.eventBus) {
      return;
    }

    const source = context.source ?? this.eventSource;
    const correlationId = context.correlationId;

    this.eventBus.emit(
      "artifact:emitted",
      {
        artifact,
        stored: result.stored,
        valid: result.valid,
        errors: result.errors,
        artifactNodeId,
      },
      {
        source,
        correlationId,
        priority: "normal",
      }
    );

    if (!result.stored) {
      this.eventBus.emit(
        "artifact:quarantined",
        {
          artifact,
          errors: result.errors ?? ["Unknown validation error"],
          artifactNodeId,
        },
        {
          source,
          correlationId,
          priority: "normal",
        }
      );
    }
  }
}

export function createArtifactRegistry({
  registerDefaults = true,
}: {
  registerDefaults?: boolean;
} = {}): ArtifactRegistry {
  const registry = new ArtifactRegistry();
  if (registerDefaults) {
    registerDefaultSchemas(registry);
  }
  return registry;
}

export function createArtifactPipeline(config: ArtifactPipelineConfig): ArtifactPipeline {
  return new ArtifactPipeline(config);
}

const planStepSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["pending", "running", "blocked", "completed", "failed"]).optional(),
});

const planCardSchema = z.object({
  goal: z.string().min(1),
  steps: z.array(planStepSchema).min(1),
});

const diffFileSchema = z.object({
  path: z.string().min(1),
  diff: z.string().min(1),
});

const diffCardSchema = z.object({
  summary: z.string().optional(),
  files: z.array(diffFileSchema).min(1),
});

const reportSectionSchema = z.object({
  heading: z.string().min(1),
  content: z.string().min(1),
});

const reportCardSchema = z.object({
  summary: z.string().min(1),
  sections: z.array(reportSectionSchema).optional(),
});

const checklistItemSchema = z.object({
  label: z.string().min(1),
  checked: z.boolean(),
});

const checklistCardSchema = z.object({
  title: z.string().optional(),
  items: z.array(checklistItemSchema).min(1),
});

function createSchemaValidator<T extends z.ZodTypeAny>(
  schema: T
): (payload: Record<string, unknown>) => ArtifactValidationResult {
  return (payload) => {
    const result = schema.safeParse(payload);
    if (result.success) {
      return { valid: true };
    }
    return {
      valid: false,
      errors: result.error.errors.map((error) => error.message),
    };
  };
}

function registerDefaultSchemas(registry: ArtifactRegistry): void {
  registry.registerSchema({
    type: "PlanCard",
    version: "1.0.0",
    validate: createSchemaValidator(planCardSchema),
  });

  registry.registerSchema({
    type: "DiffCard",
    version: "1.0.0",
    validate: createSchemaValidator(diffCardSchema),
  });

  registry.registerSchema({
    type: "ReportCard",
    version: "1.0.0",
    validate: createSchemaValidator(reportCardSchema),
  });

  registry.registerSchema({
    type: "ChecklistCard",
    version: "1.0.0",
    validate: createSchemaValidator(checklistCardSchema),
  });
}
