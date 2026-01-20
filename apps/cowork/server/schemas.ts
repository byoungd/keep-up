import { z } from "zod";

export const folderGrantSchema = z.object({
  id: z.string().min(1).optional(),
  rootPath: z.string().min(1),
  allowWrite: z.boolean().optional().default(false),
  allowDelete: z.boolean().optional().default(false),
  allowCreate: z.boolean().optional().default(false),
  outputRoots: z.array(z.string().min(1)).optional(),
});

export const connectorGrantSchema = z.object({
  id: z.string().min(1).optional(),
  provider: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional().default([]),
  allowActions: z.boolean().optional().default(false),
});

export const createSessionSchema = z.object({
  userId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  grants: z.array(folderGrantSchema).optional().default([]),
  connectors: z.array(connectorGrantSchema).optional().default([]),
  title: z.string().min(1).optional(),
});

export const updateSessionSchema = z.object({
  title: z.string().min(1).optional(),
  projectId: z.string().nullable().optional(), // Nullable to remove from project
  endedAt: z.number().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  pathHint: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).optional(),
  prompt: z.string().min(1),
  modelId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum([
    "queued",
    "planning",
    "ready",
    "running",
    "awaiting_confirmation",
    "completed",
    "failed",
    "cancelled",
  ]),
});

export const approvalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const settingsPatchSchema = z
  .object({
    openAiKey: z.string().min(1).optional(),
    anthropicKey: z.string().min(1).optional(),
    geminiKey: z.string().min(1).optional(),
    defaultModel: z.string().min(1).optional(),
    theme: z.enum(["light", "dark"]).optional(),
    memoryProfile: z.enum(["default", "strict-reviewer", "creative-prototyper"]).optional(),
  })
  .strict();

export const toolCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    intent: z.enum(["read", "write", "create", "delete", "rename", "move"]),
    reason: z.string().min(1).optional(),
    fileSizeBytes: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("network"),
    host: z.string().min(1),
    reason: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("connector"),
    connectorScopeAllowed: z.boolean(),
    reason: z.string().min(1).optional(),
  }),
]);

export const agentProtocolTaskSchema = z.object({
  input: z.string().min(1),
  additional_input: z.record(z.string(), z.unknown()).optional().default({}),
});

export const agentProtocolStepSchema = z.object({
  name: z.string().min(1).optional(),
  input: z.string().min(1),
  additional_input: z.record(z.string(), z.unknown()).optional().default({}),
});

export const agentProtocolArtifactSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["diff", "plan", "markdown", "preflight"]),
  artifact: z.record(z.string(), z.unknown()),
  sourcePath: z.string().min(1).optional(),
});
