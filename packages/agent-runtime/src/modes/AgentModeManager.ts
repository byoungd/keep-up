/**
 * Agent Mode Manager
 *
 * Manages dual operating modes for the agent: Plan Mode (read-only analysis)
 * and Build Mode (full development access).
 *
 * Inspired by OpenCode's plan/build agent switching and Claude Code's Plan Mode.
 */

/**
 * Available agent modes
 */
export type AgentMode = "plan" | "build";

/**
 * Configuration for an agent mode
 */
export interface ModeConfig {
  /** Mode identifier */
  id: AgentMode;
  /** Display name for UI */
  displayName: string;
  /** Description of mode capabilities */
  description: string;
  /** Allowed tool patterns (use '*' for all) */
  allowedTools: string[];
  /** Denied tools (takes precedence over allowed) */
  deniedTools: string[];
  /** Tools that require explicit approval even if allowed */
  requiresApprovalFor: string[];
  /** Additional system prompt text for this mode */
  systemPromptAddition: string;
}

/**
 * Plan Mode configuration - read-only analysis and planning
 */
export const PLAN_MODE: ModeConfig = {
  id: "plan",
  displayName: "Plan Mode",
  description: "Read-only analysis and planning",
  allowedTools: [
    "read_file",
    "view_file",
    "view_file_outline",
    "view_code_item",
    "search_files",
    "grep_search",
    "find_by_name",
    "list_dir",
    "codebase_search",
    "read_url_content",
    "search_web",
  ],
  deniedTools: [
    "write_to_file",
    "replace_file_content",
    "multi_replace_file_content",
    "run_command",
    "send_command_input",
    "delete_file",
    "move_file",
    "create_directory",
  ],
  requiresApprovalFor: [],
  systemPromptAddition: `You are in PLAN MODE. You can analyze the codebase, search for information, and suggest changes, but you CANNOT modify any files or run commands.

Your task is to:
1. Analyze the problem thoroughly
2. Explore relevant code and documentation
3. Generate a structured plan.md artifact with:
   - Problem analysis
   - Proposed file changes (as diff previews)
   - Implementation steps
   - Risk assessment
   - Success criteria

The user will review your plan and switch to Build Mode to implement it.`,
};

/**
 * Build Mode configuration - full development access
 */
export const BUILD_MODE: ModeConfig = {
  id: "build",
  displayName: "Build Mode",
  description: "Full development access",
  allowedTools: ["*"],
  deniedTools: [],
  requiresApprovalFor: ["delete_file", "move_file"],
  systemPromptAddition: `You are in BUILD MODE. You have full access to implement changes, including:
- Reading and writing files
- Running commands
- Creating and modifying code

Follow best practices:
- Make incremental changes and verify each step
- Run tests after making changes
- Request approval for destructive operations
- Commit changes with clear messages`,
};

/**
 * Agent Mode Manager class
 * Manages mode state and provides mode-aware tool filtering
 */
export class AgentModeManager {
  private currentMode: AgentMode = "build";
  private modeConfigs: Map<AgentMode, ModeConfig>;
  private onModeChange?: (mode: AgentMode) => void;

  constructor(initialMode: AgentMode = "build") {
    this.currentMode = initialMode;
    this.modeConfigs = new Map([
      ["plan", PLAN_MODE],
      ["build", BUILD_MODE],
    ]);
  }

  /**
   * Set mode change callback
   */
  onModeChangeCallback(callback: (mode: AgentMode) => void): void {
    this.onModeChange = callback;
  }

  /**
   * Get current mode
   */
  getMode(): AgentMode {
    return this.currentMode;
  }

  /**
   * Get current mode config
   */
  getModeConfig(): ModeConfig {
    return this.modeConfigs.get(this.currentMode) ?? BUILD_MODE;
  }

  /**
   * Set mode
   */
  setMode(mode: AgentMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.onModeChange?.(mode);
    }
  }

  /**
   * Toggle between plan and build modes
   */
  toggleMode(): AgentMode {
    const newMode: AgentMode = this.currentMode === "plan" ? "build" : "plan";
    this.setMode(newMode);
    return newMode;
  }

  /**
   * Check if a tool can be used in current mode
   */
  canUseTool(toolName: string): boolean {
    const config = this.getModeConfig();

    // Check denied list first
    if (config.deniedTools.includes(toolName)) {
      return false;
    }

    // Check allowed list
    if (config.allowedTools.includes("*")) {
      return true;
    }

    return config.allowedTools.includes(toolName);
  }

  /**
   * Check if a tool requires approval in current mode
   */
  requiresApproval(toolName: string): boolean {
    const config = this.getModeConfig();
    return config.requiresApprovalFor.includes(toolName);
  }

  /**
   * Get the denial message for a blocked tool
   */
  getDenialMessage(toolName: string): string {
    const config = this.getModeConfig();
    return (
      `Tool "${toolName}" is not available in ${config.displayName}. ` +
      `${config.description}. Switch to Build Mode to use this tool.`
    );
  }

  /**
   * Get system prompt addition for current mode
   */
  getSystemPromptAddition(): string {
    return this.getModeConfig().systemPromptAddition;
  }

  /**
   * Filter a list of tools based on current mode
   */
  filterTools<T extends { name: string }>(tools: T[]): T[] {
    return tools.filter((tool) => this.canUseTool(tool.name));
  }

  /**
   * Get list of allowed tool names for current mode
   */
  getAllowedToolNames(): string[] {
    const config = this.getModeConfig();
    if (config.allowedTools.includes("*")) {
      return ["*"];
    }
    return [...config.allowedTools];
  }

  /**
   * Get list of denied tool names for current mode
   */
  getDeniedToolNames(): string[] {
    return [...this.getModeConfig().deniedTools];
  }

  /**
   * Check if current mode is Plan Mode
   */
  isPlanMode(): boolean {
    return this.currentMode === "plan";
  }

  /**
   * Check if current mode is Build Mode
   */
  isBuildMode(): boolean {
    return this.currentMode === "build";
  }

  /**
   * Serialize mode state for persistence
   */
  toJSON(): { mode: AgentMode } {
    return { mode: this.currentMode };
  }

  /**
   * Restore mode state from persistence
   */
  static fromJSON(data: { mode?: AgentMode }): AgentModeManager {
    return new AgentModeManager(data.mode ?? "build");
  }
}

/**
 * Create a new AgentModeManager with default settings
 */
export function createAgentModeManager(initialMode?: AgentMode): AgentModeManager {
  return new AgentModeManager(initialMode ?? "build");
}
