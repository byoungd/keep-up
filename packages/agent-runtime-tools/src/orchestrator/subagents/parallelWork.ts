import type { SubagentManager } from "../subagentManager";
import type { SubagentConfig, SubagentResult } from "./types";

export interface WorkTask {
  id: string;
  description: string;
  dependencies?: string[];
}

export class ParallelWorkSubagent {
  private readonly manager: SubagentManager;
  private readonly config: SubagentConfig;

  constructor(manager: SubagentManager, config: Partial<SubagentConfig> = {}) {
    this.manager = manager;
    this.config = {
      type: "parallel-work",
      name: "Parallel Work",
      tools: ["file:*", "code:*", "bash:execute"],
      ...config,
    };
  }

  async coordinate(tasks: WorkTask[]): Promise<SubagentResult<string>[]> {
    const subagentTasks = tasks.map((task) => ({
      id: task.id,
      config: this.config,
      input: { task: task.description },
      dependencies: task.dependencies,
    }));

    return this.manager.executeParallel(subagentTasks);
  }
}
