/**
 * Artifact Registry
 *
 * Stores structured artifacts and validates payloads before emission.
 */

import { z } from "zod";

export type ArtifactType = "PlanCard" | "DiffCard" | "ReportCard" | "ChecklistCard";

export interface ArtifactEnvelope {
  id: string;
  type: ArtifactType;
  schemaVersion: string;
  title: string;
  payload: Record<string, unknown>;
  taskNodeId: string;
  createdAt: string;
  renderHints?: Record<string, unknown>;
}

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

export function createArtifactRegistry({
  registerDefaults = true,
}: { registerDefaults?: boolean } = {}): ArtifactRegistry {
  const registry = new ArtifactRegistry();
  if (registerDefaults) {
    registerDefaultSchemas(registry);
  }
  return registry;
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
