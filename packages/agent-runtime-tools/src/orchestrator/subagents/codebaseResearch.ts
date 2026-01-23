import type { SubagentManager } from "../subagentManager";
import type { SubagentConfig, SubagentResult } from "./types";

export class CodebaseResearchSubagent {
  private readonly manager: SubagentManager;
  private readonly config: SubagentConfig;

  constructor(manager: SubagentManager, config: Partial<SubagentConfig> = {}) {
    this.manager = manager;
    this.config = {
      type: "codebase-research",
      name: "Codebase Research",
      tools: ["file:read", "file:list", "file:info"],
      ...config,
    };
  }

  async research(query: string): Promise<SubagentResult<string>> {
    return this.manager.executeSubagent({
      id: crypto.randomUUID(),
      config: this.config,
      input: { query },
    });
  }
}
