/**
 * Active Context Service
 *
 * Manages workflow state persistence and auto-resume functionality.
 * Provides hooks for session lifecycle to detect and restore interrupted work.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateResumePrompt, hasResumableState, parseTaskMarkdown } from "./taskParser";
import type { MemoryCheckpoint, ResumePromptConfig, WorkflowState } from "./types";

export interface ActiveContextServiceOptions {
  /** Path to the workspace root */
  workspacePath: string;
  /** Path to task.md relative to workspace (default: "task.md") */
  taskMdPath?: string;
  /** Path to memory storage (default: ".cowork/memory.json") */
  memoryPath?: string;
  /** Maximum tokens for memory checkpoint */
  maxMemoryTokens?: number;
  /** Logger */
  logger?: Pick<Console, "info" | "warn" | "error" | "debug">;
}

const DEFAULT_TASK_PATH = "task.md";
const DEFAULT_MEMORY_PATH = ".cowork/memory.json";
const DEFAULT_MAX_TOKENS = 4000;

/**
 * Active Context Service for workflow state management
 */
export class ActiveContextService {
  private readonly options: Required<ActiveContextServiceOptions>;
  private currentState: WorkflowState | null = null;
  private checkpoint: MemoryCheckpoint | null = null;

  constructor(options: ActiveContextServiceOptions) {
    this.options = {
      taskMdPath: DEFAULT_TASK_PATH,
      memoryPath: DEFAULT_MEMORY_PATH,
      maxMemoryTokens: DEFAULT_MAX_TOKENS,
      logger: console,
      ...options,
    };
  }

  /**
   * Get the full path to task.md
   */
  getTaskPath(): string {
    return join(this.options.workspacePath, this.options.taskMdPath);
  }

  /**
   * Get the full path to memory storage
   */
  getMemoryPath(): string {
    return join(this.options.workspacePath, this.options.memoryPath);
  }

  /**
   * Load and parse the current workflow state from task.md
   */
  async loadWorkflowState(): Promise<WorkflowState | null> {
    const taskPath = this.getTaskPath();

    try {
      const content = await readFile(taskPath, "utf-8");
      const stats = await stat(taskPath);
      this.currentState = parseTaskMarkdown(content, taskPath, stats.mtime);
      return this.currentState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.options.logger.debug("No task.md found, no workflow state");
        return null;
      }
      this.options.logger.error("Failed to load task.md:", error);
      throw error;
    }
  }

  /**
   * Check if there's resumable work from a previous session
   */
  async checkForResumableWork(): Promise<{
    hasResumable: boolean;
    state: WorkflowState | null;
  }> {
    const state = await this.loadWorkflowState();

    if (!state) {
      return { hasResumable: false, state: null };
    }

    return {
      hasResumable: hasResumableState(state),
      state,
    };
  }

  /**
   * Load memory checkpoint from storage
   */
  async loadCheckpoint(sessionId: string): Promise<MemoryCheckpoint | null> {
    const memoryPath = this.getMemoryPath();

    try {
      const content = await readFile(memoryPath, "utf-8");
      const data = JSON.parse(content) as { checkpoints: MemoryCheckpoint[] };

      // Find checkpoint for this session
      const checkpoint = data.checkpoints?.find((c) => c.sessionId === sessionId);

      if (checkpoint) {
        this.checkpoint = {
          ...checkpoint,
          createdAt: new Date(checkpoint.createdAt),
          workflowState: {
            ...checkpoint.workflowState,
            lastModified: new Date(checkpoint.workflowState.lastModified),
          },
        };
        return this.checkpoint;
      }

      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.options.logger.warn("Failed to load memory checkpoint:", error);
      }
      return null;
    }
  }

  /**
   * Save a memory checkpoint
   */
  async saveCheckpoint(checkpoint: Omit<MemoryCheckpoint, "id" | "createdAt">): Promise<void> {
    const memoryPath = this.getMemoryPath();
    const dir = dirname(memoryPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Load existing checkpoints
    let data: { checkpoints: MemoryCheckpoint[] } = { checkpoints: [] };
    try {
      const content = await readFile(memoryPath, "utf-8");
      data = JSON.parse(content);
    } catch {
      // File doesn't exist, start fresh
    }

    // Create new checkpoint
    const newCheckpoint: MemoryCheckpoint = {
      ...checkpoint,
      id: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
    };

    // Remove old checkpoints for this session
    data.checkpoints = data.checkpoints.filter((c) => c.sessionId !== checkpoint.sessionId);

    // Add new checkpoint
    data.checkpoints.push(newCheckpoint);

    // Keep only last 10 checkpoints
    if (data.checkpoints.length > 10) {
      data.checkpoints = data.checkpoints.slice(-10);
    }

    await writeFile(memoryPath, JSON.stringify(data, null, 2), "utf-8");
    this.checkpoint = newCheckpoint;
  }

  /**
   * Generate a resume prompt for session start
   */
  async generateSessionResumePrompt(
    sessionId: string,
    config?: Partial<ResumePromptConfig>
  ): Promise<string | null> {
    const resolvedConfig: ResumePromptConfig = {
      includeThoughts: true,
      includeContext: true,
      maxTokens: this.options.maxMemoryTokens,
      ...config,
    };

    // Load current workflow state
    const state = await this.loadWorkflowState();
    if (!state || !hasResumableState(state)) {
      return null;
    }

    // Try to load checkpoint for additional context
    let thoughtSummary: string | undefined;
    if (resolvedConfig.includeThoughts) {
      const checkpoint = await this.loadCheckpoint(sessionId);
      thoughtSummary = checkpoint?.thoughtSummary;
    }

    return generateResumePrompt(state, thoughtSummary);
  }

  /**
   * Get the current workflow state (cached)
   */
  getCurrentState(): WorkflowState | null {
    return this.currentState;
  }

  /**
   * Get the current checkpoint (cached)
   */
  getCurrentCheckpoint(): MemoryCheckpoint | null {
    return this.checkpoint;
  }
}

/**
 * Create an Active Context Service instance
 */
export function createActiveContextService(
  options: ActiveContextServiceOptions
): ActiveContextService {
  return new ActiveContextService(options);
}
