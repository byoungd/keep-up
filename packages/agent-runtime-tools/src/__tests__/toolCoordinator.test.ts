import { describe, expect, it } from "vitest";
import { ToolCoordinator } from "../coordinator/ToolCoordinator";
import type { ToolContext, ToolHandler } from "../coordinator/ToolHandler";

const context: ToolContext = {
  cwd: "/tmp",
  taskId: "task-1",
};

describe("ToolCoordinator", () => {
  it("executes through middleware chain", async () => {
    const coordinator = new ToolCoordinator();

    const handler: ToolHandler<{ count: number }, number> = {
      name: "add",
      description: "adds one",
      schema: { type: "object" },
      execute: async (params) => params.count + 1,
      validate: (params) => ({ valid: params.count >= 0 }),
    };

    coordinator.register(handler);
    coordinator.use({
      name: "double",
      execute: async (params, _context, next) => {
        if (isCountParams(params)) {
          return next({ count: params.count * 2 });
        }
        return next(params);
      },
    });

    const result = await coordinator.execute("add", { count: 2 }, context);
    expect(result).toBe(5);
  });
});

function isCountParams(value: unknown): value is { count: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "count" in value &&
    typeof value.count === "number"
  );
}
