import type { SubagentManager } from "../subagentManager";
import type { SubagentConfig, SubagentResult } from "./types";

export class TerminalExecutorSubagent {
  private readonly manager: SubagentManager;
  private readonly config: SubagentConfig;

  constructor(manager: SubagentManager, config: Partial<SubagentConfig> = {}) {
    this.manager = manager;
    this.config = {
      type: "terminal-executor",
      name: "Terminal Executor",
      tools: ["bash:execute", "file:read", "file:list"],
      ...config,
    };
  }

  async execute(command: string): Promise<SubagentResult<string>> {
    return this.manager.executeSubagent({
      id: crypto.randomUUID(),
      config: this.config,
      input: { command },
    });
  }
}
