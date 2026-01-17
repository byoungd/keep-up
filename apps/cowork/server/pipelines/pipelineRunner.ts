import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { ToolExecutor } from "@ku0/agent-runtime";
import type {
  PipelineDefinition,
  PipelineRunRecord,
  PipelineStage,
  PipelineStageResult,
} from "./pipelineSchema";
import { pipelineRunSchema } from "./pipelineSchema";
import type { PipelineStore } from "./pipelineStore";

export interface PipelineRunnerOptions {
  store: PipelineStore;
  toolExecutor?: ToolExecutor;
  logger?: Pick<Console, "info" | "warn" | "error">;
  maxOutputBytes?: number;
}

export class PipelineRunner {
  private readonly store: PipelineStore;
  private readonly toolExecutor?: ToolExecutor;
  private readonly logger?: Pick<Console, "info" | "warn" | "error">;
  private readonly maxOutputBytes: number;
  private readonly activeRuns = new Set<string>();

  constructor(options: PipelineRunnerOptions) {
    this.store = options.store;
    this.toolExecutor = options.toolExecutor;
    this.logger = options.logger;
    this.maxOutputBytes = options.maxOutputBytes ?? 120_000;
  }

  async startRun(pipelineId: string, input?: Record<string, unknown>): Promise<PipelineRunRecord> {
    const pipeline = await this.store.getPipelineById(pipelineId);
    if (!pipeline) {
      throw new Error("Pipeline not found");
    }
    const now = Date.now();
    const run: PipelineRunRecord = pipelineRunSchema.parse({
      runId: crypto.randomUUID(),
      pipelineId,
      status: "pending",
      stageIndex: 0,
      input,
      output: undefined,
      stageResults: initializeStageResults(pipeline),
      createdAt: now,
      updatedAt: now,
    });
    await this.store.createRun(run);
    void this.executeRun(run.runId);
    return run;
  }

  async executeRun(runId: string): Promise<PipelineRunRecord | null> {
    if (this.activeRuns.has(runId)) {
      return null;
    }
    this.activeRuns.add(runId);
    try {
      const record = await this.loadRunRecord(runId);
      if (!record) {
        return null;
      }

      const running = await this.markRunRunning(runId, record.pipeline);
      if (!running) {
        return null;
      }

      return await this.executeRunStages(runId, running, record.pipeline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error?.("Pipeline execution failed", message);
      const run = await this.store.getRunById(runId);
      if (!run) {
        return null;
      }
      return await this.failRun(run, message);
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  async resumePendingRuns(): Promise<void> {
    const runs = await this.store.listRunsByStatus(["pending", "running"]);
    for (const run of runs) {
      void this.executeRun(run.runId);
    }
  }

  private async executeStageWithRetry(stage: PipelineStage): Promise<PipelineStageResult> {
    const retry = stage.retry ?? { maxAttempts: 1, backoffMs: 0 };
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < retry.maxAttempts) {
      attempts += 1;
      const startedAt = Date.now();
      const execution = await this.executeStage(stage);
      const durationMs = Date.now() - startedAt;
      const result: PipelineStageResult = {
        stageId: stage.stageId,
        status: execution.success ? "completed" : "failed",
        attempts,
        startedAt,
        completedAt: Date.now(),
        durationMs,
        output: execution.output,
        error: execution.error,
      };

      if (execution.success) {
        return result;
      }
      lastError = execution.error;

      if (attempts < retry.maxAttempts && retry.backoffMs > 0) {
        await delay(retry.backoffMs);
      }
    }

    return {
      stageId: stage.stageId,
      status: "failed",
      attempts,
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      output: undefined,
      error: lastError ?? "Stage failed",
    };
  }

  private async executeStage(
    stage: PipelineStage
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    if (stage.type === "command") {
      return this.executeCommandStage(stage);
    }
    if (!this.toolExecutor) {
      return { success: false, error: "Tool executor not configured" };
    }
    try {
      const result = await this.toolExecutor.execute(
        { name: stage.toolName ?? "", arguments: stage.args ?? {} },
        {
          security: {
            sandbox: {
              type: "process",
              networkAccess: "none",
              fsIsolation: "workspace",
            },
            permissions: {
              bash: "sandbox",
              file: "workspace",
              code: "sandbox",
              network: "none",
              lfcc: "read",
            },
            limits: {
              maxExecutionTimeMs: stage.timeoutMs ?? 30_000,
              maxMemoryBytes: 256 * 1024 * 1024,
              maxOutputBytes: this.maxOutputBytes,
              maxConcurrentCalls: 3,
            },
          },
        }
      );
      if (!result.success) {
        return { success: false, error: result.error?.message ?? "Tool failed" };
      }
      return {
        success: true,
        output: result.content
          .map((c) => ("text" in c ? c.text : ""))
          .filter((text) => text.length > 0)
          .join("\n"),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async executeCommandStage(
    stage: PipelineStage
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const command = stage.command ?? "";
    const timeoutMs = stage.timeoutMs ?? 30_000;
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        cwd: stage.cwd,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length + chunk.length > this.maxOutputBytes) {
          truncated = true;
          const remaining = this.maxOutputBytes - stdout.length;
          if (remaining > 0) {
            stdout += chunk.subarray(0, remaining).toString();
          }
        } else {
          stdout += chunk.toString();
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length + chunk.length > this.maxOutputBytes) {
          truncated = true;
          const remaining = this.maxOutputBytes - stderr.length;
          if (remaining > 0) {
            stderr += chunk.subarray(0, remaining).toString();
          }
        } else {
          stderr += chunk.toString();
        }
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve(
          buildCommandResult({
            code,
            timedOut,
            truncated,
            stdout,
            stderr,
          })
        );
      });
    });
  }

  private async failRun(run: PipelineRunRecord, error: string): Promise<PipelineRunRecord | null> {
    return this.store.updateRun(run.runId, (existing) => ({
      ...existing,
      status: "failed",
      error,
      completedAt: Date.now(),
    }));
  }

  private async loadRunRecord(
    runId: string
  ): Promise<{ run: PipelineRunRecord; pipeline: PipelineDefinition } | null> {
    const run = await this.store.getRunById(runId);
    if (!run) {
      return null;
    }
    const pipeline = await this.store.getPipelineById(run.pipelineId);
    if (!pipeline) {
      await this.failRun(run, "Pipeline definition missing");
      return null;
    }
    return { run, pipeline };
  }

  private async markRunRunning(
    runId: string,
    pipeline: PipelineDefinition
  ): Promise<PipelineRunRecord | null> {
    return this.store.updateRun(runId, (existing) => ({
      ...existing,
      status: "running",
      startedAt: existing.startedAt ?? Date.now(),
      stageResults:
        existing.stageResults.length === pipeline.stages.length
          ? existing.stageResults
          : initializeStageResults(pipeline),
    }));
  }

  private async executeRunStages(
    runId: string,
    run: PipelineRunRecord,
    pipeline: PipelineDefinition
  ): Promise<PipelineRunRecord | null> {
    let current = run;
    for (let index = current.stageIndex; index < pipeline.stages.length; index += 1) {
      const stage = pipeline.stages[index];
      const result = await this.executeStageWithRetry(stage);
      const updatedRun = await this.store.updateRun(runId, (existing: PipelineRunRecord) =>
        updateStageResult(existing, index, result)
      );
      if (!updatedRun) {
        return null;
      }
      current = updatedRun;
      if (result.status === "failed") {
        return await this.failRun(current, result.error ?? "Stage failed");
      }
      const finalRun = await this.store.updateRun(runId, (existing: PipelineRunRecord) => ({
        ...existing,
        stageIndex: index + 1,
      }));
      if (!finalRun) {
        return null;
      }
      current = finalRun;
    }

    return await this.store.updateRun(runId, (existing) => ({
      ...existing,
      status: "completed",
      completedAt: Date.now(),
    }));
  }
}

export function createPipelineRunner(options: PipelineRunnerOptions): PipelineRunner {
  return new PipelineRunner(options);
}

function initializeStageResults(pipeline: PipelineDefinition): PipelineStageResult[] {
  return pipeline.stages.map((stage) => ({
    stageId: stage.stageId,
    status: "pending",
    attempts: 0,
  }));
}

function updateStageResult(
  run: PipelineRunRecord,
  index: number,
  result: PipelineStageResult
): PipelineRunRecord {
  const nextResults = [...run.stageResults];
  nextResults[index] = result;
  return {
    ...run,
    stageResults: nextResults,
    updatedAt: Date.now(),
  };
}

function buildCommandResult(input: {
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
  stdout: string;
  stderr: string;
}): { success: boolean; output?: string; error?: string } {
  const output = [input.stdout, input.stderr ? `[stderr]\n${input.stderr}` : ""]
    .filter((part) => part.length > 0)
    .join("\n");
  const success = input.code === 0 && !input.timedOut;

  if (input.truncated) {
    const combined = output ? `${output}\n[output truncated]` : "[output truncated]";
    return {
      success,
      output: combined,
      error: success ? undefined : combined,
    };
  }

  return {
    success,
    output,
    error: success ? undefined : output,
  };
}
