import { z } from "zod";

export const pipelineStageRetrySchema = z.object({
  maxAttempts: z.number().int().min(1).default(1),
  backoffMs: z.number().int().min(0).default(0),
});

export const pipelineStageSchema = z
  .object({
    stageId: z.string(),
    name: z.string(),
    type: z.enum(["command", "tool"]),
    command: z.string().optional(),
    cwd: z.string().optional(),
    toolName: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    timeoutMs: z.number().int().optional(),
    retry: pipelineStageRetrySchema.optional(),
  })
  .superRefine((stage, ctx) => {
    if (stage.type === "command" && !stage.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "command stage requires command",
        path: ["command"],
      });
    }
    if (stage.type === "tool" && !stage.toolName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tool stage requires toolName",
        path: ["toolName"],
      });
    }
  });

export const pipelineSchema = z.object({
  pipelineId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  stages: z.array(pipelineStageSchema).min(1),
  version: z.string().default("1.0.0"),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const pipelineInputSchema = pipelineSchema
  .omit({ pipelineId: true, createdAt: true, updatedAt: true })
  .extend({
    pipelineId: z.string().optional(),
  });

export const pipelineStageResultSchema = z.object({
  stageId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  attempts: z.number().int(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
});

export const pipelineRunSchema = z.object({
  runId: z.string(),
  pipelineId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  stageIndex: z.number().int(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  stageResults: z.array(pipelineStageResultSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
});

export type PipelineStage = z.infer<typeof pipelineStageSchema>;
export type PipelineDefinition = z.infer<typeof pipelineSchema>;
export type PipelineInput = z.infer<typeof pipelineInputSchema>;
export type PipelineStageResult = z.infer<typeof pipelineStageResultSchema>;
export type PipelineRunRecord = z.infer<typeof pipelineRunSchema>;
export type PipelineRunStatus = PipelineRunRecord["status"];
