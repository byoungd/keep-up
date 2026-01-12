/**
 * Pipeline Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPipeline, createPipelineExecutor, createSequentialPipeline } from "../pipeline";

describe("Pipeline", () => {
  // Mock tool executor
  const mockToolExecutor = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "uppercase") {
      return { result: String(args.text).toUpperCase() };
    }
    if (name === "reverse") {
      return { result: String(args.text).split("").reverse().join("") };
    }
    if (name === "length") {
      return { result: String(args.text).length };
    }
    if (name === "failing") {
      throw new Error("Tool failed");
    }
    return { result: args };
  });

  beforeEach(() => {
    mockToolExecutor.mockClear();
  });

  describe("PipelineBuilder", () => {
    it("should create a simple pipeline", () => {
      const pipeline = createPipeline("Test Pipeline")
        .id("test-1")
        .description("A test pipeline")
        .build();

      expect(pipeline.id).toBe("test-1");
      expect(pipeline.name).toBe("Test Pipeline");
      expect(pipeline.description).toBe("A test pipeline");
      expect(pipeline.steps).toHaveLength(0);
    });

    it("should add tool steps", () => {
      const pipeline = createPipeline("Tool Pipeline")
        .tool("uppercase", (input) => ({ text: input }))
        .tool("reverse", (input) => ({ text: (input as { result: string }).result }))
        .build();

      expect(pipeline.steps).toHaveLength(2);
      expect(pipeline.steps[0].type).toBe("tool");
      expect(pipeline.steps[1].type).toBe("tool");
    });

    it("should add transform steps", () => {
      const pipeline = createPipeline("Transform Pipeline")
        .transform("Double", (input) => (input as number) * 2)
        .build();

      expect(pipeline.steps).toHaveLength(1);
      expect(pipeline.steps[0].type).toBe("transform");
    });
  });

  describe("PipelineExecutor", () => {
    it("should execute a simple pipeline", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Simple")
        .tool("uppercase", (input) => ({ text: input }))
        .build();

      const result = await executor.execute(pipeline, "hello");

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: "HELLO" });
      expect(result.stepsExecuted).toBe(1);
      expect(mockToolExecutor).toHaveBeenCalledWith("uppercase", { text: "hello" });
    });

    it("should chain multiple tools", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Chain")
        .tool("uppercase", (input) => ({ text: input }), {
          resultMapper: (r) => (r as { result: string }).result,
        })
        .tool("reverse", (input) => ({ text: input }), {
          resultMapper: (r) => (r as { result: string }).result,
        })
        .build();

      const result = await executor.execute(pipeline, "hello");

      expect(result.success).toBe(true);
      expect(result.output).toBe("OLLEH");
      expect(result.stepsExecuted).toBe(2);
    });

    it("should execute transform steps", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Transform")
        .transform("Add prefix", (input) => `prefix_${input}`)
        .transform("Add suffix", (input) => `${input}_suffix`)
        .build();

      const result = await executor.execute(pipeline, "value");

      expect(result.success).toBe(true);
      expect(result.output).toBe("prefix_value_suffix");
    });

    it("should handle tool errors", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Failing")
        .tool("failing", (input) => ({ text: input }))
        .build();

      const result = await executor.execute(pipeline, "test");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Tool failed");
      expect(result.error?.stepIndex).toBe(0);
    });

    it("should track step results", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Tracked")
        .transform("Step 1", (input) => (input as number) + 1)
        .transform("Step 2", (input) => (input as number) * 2)
        .build();

      const result = await executor.execute(pipeline, 5);

      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].stepName).toBe("Step 1");
      expect(result.stepResults[0].input).toBe(5);
      expect(result.stepResults[0].output).toBe(6);
      expect(result.stepResults[1].stepName).toBe("Step 2");
      expect(result.stepResults[1].input).toBe(6);
      expect(result.stepResults[1].output).toBe(12);
    });

    it("should support abort signal", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);
      const controller = new AbortController();

      const pipeline = createPipeline("Abortable")
        .transform("Step 1", (input) => input)
        .transform("Step 2", (input) => input)
        .build();

      // Abort before execution
      controller.abort();

      const result = await executor.execute(pipeline, "test", {
        signal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Pipeline aborted");
    });

    it("should call progress callback", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);
      const onProgress = vi.fn();

      const pipeline = createPipeline("Progress")
        .transform("Step 1", (input) => input)
        .build();

      await executor.execute(pipeline, "test", { onProgress });

      expect(onProgress).toHaveBeenCalledWith("Step 1", "started", expect.any(Object));
      expect(onProgress).toHaveBeenCalledWith("Step 1", "completed", expect.any(Object));
    });
  });

  describe("variables", () => {
    it("should set and get variables", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createPipeline("Variables")
        .setVariable("original", (input) => input)
        .transform("Modify", (input) => `modified_${input}`)
        .transform("Use variable", (_input, context) => {
          const original = context.variables.get("original");
          return `${original} -> modified`;
        })
        .build();

      const result = await executor.execute(pipeline, "value");

      expect(result.success).toBe(true);
      expect(result.output).toBe("value -> modified");
    });
  });

  describe("conditional execution", () => {
    it("should execute true branch", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const trueBranch = createPipeline("True Branch")
        .transform("True", () => "took true branch")
        .build();

      const falseBranch = createPipeline("False Branch")
        .transform("False", () => "took false branch")
        .build();

      const pipeline = createPipeline("Conditional")
        .condition("Check value", (input) => (input as number) > 5, trueBranch, falseBranch)
        .build();

      const result = await executor.execute(pipeline, 10);

      expect(result.success).toBe(true);
      expect(result.output).toBe("took true branch");
    });

    it("should execute false branch", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const trueBranch = createPipeline("True Branch")
        .transform("True", () => "took true branch")
        .build();

      const falseBranch = createPipeline("False Branch")
        .transform("False", () => "took false branch")
        .build();

      const pipeline = createPipeline("Conditional")
        .condition("Check value", (input) => (input as number) > 5, trueBranch, falseBranch)
        .build();

      const result = await executor.execute(pipeline, 3);

      expect(result.success).toBe(true);
      expect(result.output).toBe("took false branch");
    });
  });

  describe("parallel execution", () => {
    it("should execute branches in parallel", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const branch1 = createPipeline("Branch 1")
        .transform("B1", (input) => `branch1_${input}`)
        .build();

      const branch2 = createPipeline("Branch 2")
        .transform("B2", (input) => `branch2_${input}`)
        .build();

      const pipeline = createPipeline("Parallel")
        .parallel("Run parallel", [branch1, branch2])
        .build();

      const result = await executor.execute(pipeline, "value");

      expect(result.success).toBe(true);
      expect(result.output).toEqual(["branch1_value", "branch2_value"]);
    });

    it("should merge parallel results", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const branch1 = createPipeline("Branch 1")
        .transform("B1", () => 1)
        .build();

      const branch2 = createPipeline("Branch 2")
        .transform("B2", () => 2)
        .build();

      const pipeline = createPipeline("Parallel Merge")
        .parallel("Sum", [branch1, branch2], {
          merger: (results) => (results as number[]).reduce((a, b) => a + b, 0),
        })
        .build();

      const result = await executor.execute(pipeline, null);

      expect(result.success).toBe(true);
      expect(result.output).toBe(3);
    });
  });

  describe("loop execution", () => {
    it("should loop until condition is false", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const body = createPipeline("Loop Body")
        .transform("Increment", (input) => (input as number) + 1)
        .build();

      const pipeline = createPipeline("Loop")
        .loop("Count to 5", body, (input) => (input as number) < 5, 10)
        .build();

      const result = await executor.execute(pipeline, 0);

      expect(result.success).toBe(true);
      expect(result.output).toBe(5);
    });

    it("should respect max iterations", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const body = createPipeline("Loop Body")
        .transform("Increment", (input) => (input as number) + 1)
        .build();

      const pipeline = createPipeline("Loop")
        .loop("Infinite", body, () => true, 5) // Always true, but max 5
        .build();

      const result = await executor.execute(pipeline, 0);

      expect(result.success).toBe(true);
      expect(result.output).toBe(5);
    });
  });

  describe("createSequentialPipeline", () => {
    it("should create a sequential pipeline from tools", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const pipeline = createSequentialPipeline("Sequential", [
        { name: "uppercase", argMapper: (input) => ({ text: input }) },
      ]);

      const result = await executor.execute(pipeline, "hello");

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: "HELLO" });
    });
  });

  describe("complex pipelines", () => {
    it("should handle nested structures", async () => {
      const executor = createPipelineExecutor(mockToolExecutor);

      const innerPipeline = createPipeline("Inner")
        .transform("Double", (input) => (input as number) * 2)
        .build();

      const pipeline = createPipeline("Outer")
        .transform("Add 1", (input) => (input as number) + 1)
        .condition("Check > 5", (input) => (input as number) > 5, innerPipeline)
        .transform("Subtract 1", (input) => (input as number) - 1)
        .build();

      // Input 10 -> +1 = 11 -> >5 so double = 22 -> -1 = 21
      const result = await executor.execute(pipeline, 10);

      expect(result.success).toBe(true);
      expect(result.output).toBe(21);
    });
  });
});
