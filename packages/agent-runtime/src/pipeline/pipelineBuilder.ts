/**
 * Tool Pipeline System
 *
 * Provides declarative composition of tools into pipelines.
 * Supports sequential, parallel, and conditional execution patterns.
 */

// ============================================================================
// Types
// ============================================================================

/** Pipeline step types */
export type PipelineStepType =
  | "tool"
  | "transform"
  | "condition"
  | "parallel"
  | "loop"
  | "checkpoint";

/** Base pipeline step */
export interface PipelineStep<TInput = unknown, TOutput = unknown> {
  /** Step type */
  type: PipelineStepType;

  /** Unique step ID */
  id: string;

  /** Step name for display */
  name: string;

  /** Execute the step */
  execute(input: TInput, context: PipelineContext): Promise<TOutput>;
}

/** Tool step - executes a tool */
export interface ToolStep extends PipelineStep {
  type: "tool";
  toolName: string;
  argMapper: (input: unknown) => Record<string, unknown>;
  resultMapper?: (result: unknown) => unknown;
}

/** Transform step - transforms data */
export interface TransformStep extends PipelineStep {
  type: "transform";
  transformer: (input: unknown, context: PipelineContext) => unknown | Promise<unknown>;
}

/** Condition step - branches based on condition */
export interface ConditionStep extends PipelineStep {
  type: "condition";
  predicate: (input: unknown, context: PipelineContext) => boolean | Promise<boolean>;
  trueBranch: Pipeline;
  falseBranch?: Pipeline;
}

/** Parallel step - executes multiple pipelines in parallel */
export interface ParallelStep extends PipelineStep {
  type: "parallel";
  branches: Pipeline[];
  mergeStrategy: "all" | "first" | "race";
  merger?: (results: unknown[]) => unknown;
}

/** Loop step - repeats until condition */
export interface LoopStep extends PipelineStep {
  type: "loop";
  body: Pipeline;
  condition: (
    input: unknown,
    iteration: number,
    context: PipelineContext
  ) => boolean | Promise<boolean>;
  maxIterations: number;
}

/** Pipeline execution context */
export interface PipelineContext {
  /** Pipeline ID */
  pipelineId: string;

  /** Execution ID */
  executionId: string;

  /** Current step index */
  stepIndex: number;

  /** Variables shared across steps */
  variables: Map<string, unknown>;

  /** Tool executor function */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;

  /** Abort signal */
  signal?: AbortSignal;

  /** Metadata */
  metadata: Record<string, unknown>;

  /** Event emitter for progress */
  onProgress?: (step: string, status: "started" | "completed" | "failed", data?: unknown) => void;
}

/** Pipeline definition */
export interface Pipeline {
  /** Pipeline ID */
  id: string;

  /** Pipeline name */
  name: string;

  /** Pipeline description */
  description?: string;

  /** Steps to execute */
  steps: PipelineStep[];

  /** Input schema (for validation) */
  inputSchema?: Record<string, unknown>;

  /** Output schema (for validation) */
  outputSchema?: Record<string, unknown>;
}

/** Pipeline execution result */
export interface PipelineResult<T = unknown> {
  /** Whether execution succeeded */
  success: boolean;

  /** Final output */
  output: T;

  /** Steps executed */
  stepsExecuted: number;

  /** Total duration in ms */
  durationMs: number;

  /** Per-step results */
  stepResults: StepResult[];

  /** Error if failed */
  error?: {
    message: string;
    stepId: string;
    stepIndex: number;
  };
}

/** Individual step result */
export interface StepResult {
  stepId: string;
  stepName: string;
  status: "success" | "failed" | "skipped";
  input: unknown;
  output: unknown;
  durationMs: number;
  error?: string;
}

// ============================================================================
// Pipeline Executor
// ============================================================================

/**
 * Executes pipelines with proper error handling and progress tracking.
 */
export class PipelineExecutor {
  private readonly toolExecutor: (name: string, args: Record<string, unknown>) => Promise<unknown>;

  constructor(toolExecutor: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
    this.toolExecutor = toolExecutor;
  }

  /**
   * Execute a pipeline.
   */
  async execute<TInput, TOutput>(
    pipeline: Pipeline,
    input: TInput,
    options: {
      signal?: AbortSignal;
      metadata?: Record<string, unknown>;
      onProgress?: PipelineContext["onProgress"];
    } = {}
  ): Promise<PipelineResult<TOutput>> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];

    const context: PipelineContext = {
      pipelineId: pipeline.id,
      executionId: this.generateExecutionId(),
      stepIndex: 0,
      variables: new Map(),
      executeTool: this.toolExecutor,
      signal: options.signal,
      metadata: options.metadata ?? {},
      onProgress: options.onProgress,
    };

    let currentOutput: unknown = input;

    try {
      for (let i = 0; i < pipeline.steps.length; i++) {
        // Check for abort
        if (options.signal?.aborted) {
          return {
            success: false,
            output: currentOutput as TOutput,
            stepsExecuted: i,
            durationMs: Date.now() - startTime,
            stepResults,
            error: {
              message: "Pipeline aborted",
              stepId: pipeline.steps[i].id,
              stepIndex: i,
            },
          };
        }

        const step = pipeline.steps[i];
        context.stepIndex = i;

        const stepStart = Date.now();
        context.onProgress?.(step.name, "started", { input: currentOutput });

        try {
          const stepOutput = await step.execute(currentOutput, context);

          stepResults.push({
            stepId: step.id,
            stepName: step.name,
            status: "success",
            input: currentOutput,
            output: stepOutput,
            durationMs: Date.now() - stepStart,
          });

          currentOutput = stepOutput;
          context.onProgress?.(step.name, "completed", { output: stepOutput });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          stepResults.push({
            stepId: step.id,
            stepName: step.name,
            status: "failed",
            input: currentOutput,
            output: undefined,
            durationMs: Date.now() - stepStart,
            error: errorMessage,
          });

          context.onProgress?.(step.name, "failed", { error: errorMessage });

          return {
            success: false,
            output: currentOutput as TOutput,
            stepsExecuted: i + 1,
            durationMs: Date.now() - startTime,
            stepResults,
            error: {
              message: errorMessage,
              stepId: step.id,
              stepIndex: i,
            },
          };
        }
      }

      return {
        success: true,
        output: currentOutput as TOutput,
        stepsExecuted: pipeline.steps.length,
        durationMs: Date.now() - startTime,
        stepResults,
      };
    } catch (error) {
      return {
        success: false,
        output: currentOutput as TOutput,
        stepsExecuted: context.stepIndex,
        durationMs: Date.now() - startTime,
        stepResults,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stepId: pipeline.steps[context.stepIndex]?.id ?? "unknown",
          stepIndex: context.stepIndex,
        },
      };
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

// ============================================================================
// Pipeline Builder
// ============================================================================

/**
 * Fluent builder for creating pipelines.
 */
export class PipelineBuilder {
  private readonly steps: PipelineStep[] = [];
  private pipelineId: string;
  private pipelineName: string;
  private pipelineDescription?: string;
  private stepCounter = 0;

  constructor(name: string) {
    this.pipelineId = `pipeline_${Date.now().toString(36)}`;
    this.pipelineName = name;
  }

  /**
   * Set pipeline ID.
   */
  id(id: string): this {
    this.pipelineId = id;
    return this;
  }

  /**
   * Set pipeline description.
   */
  description(desc: string): this {
    this.pipelineDescription = desc;
    return this;
  }

  /**
   * Add a tool step.
   */
  tool(
    toolName: string,
    argMapper: (input: unknown) => Record<string, unknown>,
    options?: {
      name?: string;
      resultMapper?: (result: unknown) => unknown;
    }
  ): this {
    const stepId = this.generateStepId();

    const step: ToolStep = {
      type: "tool",
      id: stepId,
      name: options?.name ?? `Call ${toolName}`,
      toolName,
      argMapper,
      resultMapper: options?.resultMapper,
      execute: async (input, context) => {
        const args = argMapper(input);
        const result = await context.executeTool(toolName, args);
        return options?.resultMapper ? options.resultMapper(result) : result;
      },
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a transform step.
   */
  transform(
    name: string,
    transformer: (input: unknown, context: PipelineContext) => unknown | Promise<unknown>
  ): this {
    const step: TransformStep = {
      type: "transform",
      id: this.generateStepId(),
      name,
      transformer,
      execute: async (input, context) => transformer(input, context),
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a conditional branch.
   */
  condition(
    name: string,
    predicate: (input: unknown, context: PipelineContext) => boolean | Promise<boolean>,
    trueBranch: Pipeline,
    falseBranch?: Pipeline
  ): this {
    const step: ConditionStep = {
      type: "condition",
      id: this.generateStepId(),
      name,
      predicate,
      trueBranch,
      falseBranch,
      execute: async (input, context) => {
        const result = await predicate(input, context);
        const executor = new PipelineExecutor(context.executeTool);

        if (result) {
          const pipelineResult = await executor.execute(trueBranch, input, {
            signal: context.signal,
            metadata: context.metadata,
            onProgress: context.onProgress,
          });
          return pipelineResult.output;
        }
        if (falseBranch) {
          const pipelineResult = await executor.execute(falseBranch, input, {
            signal: context.signal,
            metadata: context.metadata,
            onProgress: context.onProgress,
          });
          return pipelineResult.output;
        }
        return input;
      },
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add parallel execution.
   */
  parallel(
    name: string,
    branches: Pipeline[],
    options?: {
      mergeStrategy?: "all" | "first" | "race";
      merger?: (results: unknown[]) => unknown;
    }
  ): this {
    const mergeStrategy = options?.mergeStrategy ?? "all";

    const step: ParallelStep = {
      type: "parallel",
      id: this.generateStepId(),
      name,
      branches,
      mergeStrategy,
      merger: options?.merger,
      execute: async (input, context) => {
        const executor = new PipelineExecutor(context.executeTool);

        const promises = branches.map((branch) =>
          executor.execute(branch, input, {
            signal: context.signal,
            metadata: context.metadata,
          })
        );

        if (mergeStrategy === "race") {
          const result = await Promise.race(promises);
          return result.output;
        }

        if (mergeStrategy === "first") {
          for (const promise of promises) {
            const result = await promise;
            if (result.success) {
              return result.output;
            }
          }
          throw new Error("All parallel branches failed");
        }

        // "all" strategy
        const results = await Promise.all(promises);
        const outputs = results.map((r) => r.output);

        if (options?.merger) {
          return options.merger(outputs);
        }

        return outputs;
      },
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a loop.
   */
  loop(
    name: string,
    body: Pipeline,
    condition: (
      input: unknown,
      iteration: number,
      context: PipelineContext
    ) => boolean | Promise<boolean>,
    maxIterations = 10
  ): this {
    const step: LoopStep = {
      type: "loop",
      id: this.generateStepId(),
      name,
      body,
      condition,
      maxIterations,
      execute: async (input, context) => {
        const executor = new PipelineExecutor(context.executeTool);
        let current = input;
        let iteration = 0;

        while (iteration < maxIterations) {
          const shouldContinue = await condition(current, iteration, context);
          if (!shouldContinue) {
            break;
          }

          const result = await executor.execute(body, current, {
            signal: context.signal,
            metadata: context.metadata,
          });

          if (!result.success) {
            throw new Error(`Loop iteration ${iteration} failed: ${result.error?.message}`);
          }

          current = result.output;
          iteration++;
        }

        return current;
      },
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a variable set step.
   */
  setVariable(name: string, extractor: (input: unknown) => unknown): this {
    return this.transform(`Set ${name}`, (input, context) => {
      context.variables.set(name, extractor(input));
      return input;
    });
  }

  /**
   * Add a variable get step.
   */
  getVariable(name: string): this {
    return this.transform(`Get ${name}`, (_input, context) => {
      return context.variables.get(name);
    });
  }

  /**
   * Add a logging step.
   */
  log(label: string): this {
    return this.transform(`Log: ${label}`, (input) => {
      return input;
    });
  }

  /**
   * Build the pipeline.
   */
  build(): Pipeline {
    return {
      id: this.pipelineId,
      name: this.pipelineName,
      description: this.pipelineDescription,
      steps: [...this.steps],
    };
  }

  private generateStepId(): string {
    return `step_${++this.stepCounter}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a pipeline builder.
 */
export function createPipeline(name: string): PipelineBuilder {
  return new PipelineBuilder(name);
}

/**
 * Create a pipeline executor.
 */
export function createPipelineExecutor(
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<unknown>
): PipelineExecutor {
  return new PipelineExecutor(toolExecutor);
}

// ============================================================================
// Common Pipeline Patterns
// ============================================================================

/**
 * Create a simple sequential pipeline from tool names.
 */
export function createSequentialPipeline(
  name: string,
  tools: Array<{
    name: string;
    argMapper: (input: unknown) => Record<string, unknown>;
  }>
): Pipeline {
  const builder = createPipeline(name);

  for (const tool of tools) {
    builder.tool(tool.name, tool.argMapper);
  }

  return builder.build();
}

/**
 * Create a retry pipeline.
 */
export function createRetryPipeline(innerPipeline: Pipeline, maxRetries: number): Pipeline {
  return createPipeline(`Retry: ${innerPipeline.name}`)
    .loop("Retry loop", innerPipeline, (_input, iteration) => iteration < maxRetries, maxRetries)
    .build();
}
