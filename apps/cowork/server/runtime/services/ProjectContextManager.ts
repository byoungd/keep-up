import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoworkSession } from "@ku0/agent-runtime";
import {
  analyzeProject,
  createProjectContext,
  generateAgentsMd,
  parseCustomInstructions,
  parseNotes,
} from "@ku0/project-context";
import { DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET } from "@ku0/shared";
import type { ContextIndexManager } from "../../services/contextIndexManager";
import { truncateToTokenBudget } from "../utils/tokenEstimation";

type Logger = Pick<Console, "info" | "warn" | "error" | "debug">;

const AGENTS_MD_DIR = ".cowork";
const AGENTS_MD_FILE = "AGENTS.md";

export class ProjectContextManager {
  private readonly logger: Logger;
  private readonly contextIndexManager?: ContextIndexManager;

  constructor(logger: Logger, contextIndexManager?: ContextIndexManager) {
    this.logger = {
      ...logger,
      debug: logger.debug ? logger.debug.bind(logger) : () => undefined,
    };
    this.contextIndexManager = contextIndexManager;
  }

  async getContext(session: CoworkSession, tokenBudget?: number): Promise<string | undefined> {
    return this.loadProjectContext(session, tokenBudget);
  }

  async regenerateContext(session: CoworkSession): Promise<string> {
    const rootPath = resolveRootPath(session);
    if (!rootPath) {
      throw new Error("No root path in session grants");
    }

    const agentsMdPath = resolveAgentsMdPath(rootPath);
    this.logger.info("Regenerating project context", { rootPath });

    const existingContent = await readAgentsMdIfExists(agentsMdPath);
    const analysis = await analyzeProject(rootPath);
    const context = createProjectContext(analysis);

    if (existingContent) {
      const existingInstructions = parseCustomInstructions(existingContent);
      if (existingInstructions.length > 0) {
        context.customInstructions = existingInstructions;
      }
      const existingNotes = parseNotes(existingContent);
      if (existingNotes !== undefined) {
        context.notes = existingNotes;
      }
    }

    const agentsMd = generateAgentsMd(context);
    await ensureAgentsDir(rootPath);
    await writeFile(agentsMdPath, agentsMd, "utf-8");
    return agentsMd;
  }

  async saveContext(session: CoworkSession, content: string): Promise<string> {
    const rootPath = resolveRootPath(session);
    if (!rootPath) {
      throw new Error("No root path in session grants");
    }

    const agentsMdPath = resolveAgentsMdPath(rootPath);
    this.logger.info("Saving project context", { rootPath });

    await ensureAgentsDir(rootPath);
    await writeFile(agentsMdPath, content, "utf-8");
    return content;
  }

  private async loadProjectContext(session: CoworkSession, tokenBudget?: number): Promise<string> {
    const rootPath = resolveRootPath(session);
    if (!rootPath) {
      this.logger.warn("No root path found in session grants, skipping project context");
      return "";
    }

    const budget = tokenBudget ?? DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET;
    const agentsMdPath = resolveAgentsMdPath(rootPath);

    try {
      if (existsSync(agentsMdPath)) {
        this.logger.debug("Loading project context from AGENTS.md");
        const content = await readFile(agentsMdPath, "utf-8");
        return truncateToTokenBudget(content, budget);
      }

      this.logger.info("AGENTS.md not found, analyzing project...");
      const analysis = await analyzeProject(rootPath);
      const context = createProjectContext(analysis);
      const agentsMd = generateAgentsMd(context);

      try {
        await ensureAgentsDir(rootPath);
        await writeFile(agentsMdPath, agentsMd, "utf-8");
      } catch (writeErr) {
        this.logger.warn("Failed to write AGENTS.md", { error: writeErr });
      }

      return truncateToTokenBudget(agentsMd, budget);
    } catch (error) {
      this.logger.error("Error loading project context", { error });
      return "";
    }
  }

  async getContextPackPrompt(session: CoworkSession): Promise<{
    prompt?: string;
    packKey: string | null;
  }>;
  async getContextPackPrompt(
    session: CoworkSession,
    options: { tokenBudget?: number; tokenModel?: string; respectGitignore?: boolean }
  ): Promise<{
    prompt?: string;
    packKey: string | null;
  }>;
  async getContextPackPrompt(
    session: CoworkSession,
    options?: { tokenBudget?: number; tokenModel?: string; respectGitignore?: boolean }
  ): Promise<{
    prompt?: string;
    packKey: string | null;
  }> {
    const rootPath = resolveRootPath(session);
    if (!rootPath || !this.contextIndexManager) {
      return { prompt: undefined, packKey: null };
    }

    try {
      const index = this.contextIndexManager.getIndex(rootPath, {
        tokenModel: options?.tokenModel,
        respectGitignore: options?.respectGitignore,
      });
      const pins = await index.getPins(session.sessionId);
      if (!pins || pins.packIds.length === 0) {
        return { prompt: undefined, packKey: null };
      }

      const packKey = await buildPackKey(index, pins.packIds);
      const tokenBudget = options?.tokenBudget;
      if (tokenBudget !== undefined && tokenBudget <= 0) {
        return { prompt: undefined, packKey };
      }
      const prompt = await index.buildPackPrompt(pins.packIds, {
        ...(tokenBudget !== undefined ? { tokenBudget } : {}),
      });

      return { prompt, packKey };
    } catch (error) {
      this.logger.warn("Failed to build context pack prompt", { error });
      return { prompt: undefined, packKey: null };
    }
  }

  async getContextPackKey(
    session: CoworkSession,
    options?: { tokenModel?: string; respectGitignore?: boolean }
  ): Promise<string | null> {
    const rootPath = resolveRootPath(session);
    if (!rootPath || !this.contextIndexManager) {
      return null;
    }

    try {
      const index = this.contextIndexManager.getIndex(rootPath, {
        tokenModel: options?.tokenModel,
        respectGitignore: options?.respectGitignore,
      });
      const pins = await index.getPins(session.sessionId);
      if (!pins || pins.packIds.length === 0) {
        return null;
      }

      return buildPackKey(index, pins.packIds);
    } catch (error) {
      this.logger.warn("Failed to load context pack key", { error });
      return null;
    }
  }
}

function resolveRootPath(session: CoworkSession): string | null {
  for (const grant of session.grants ?? []) {
    if (typeof grant.rootPath === "string") {
      return grant.rootPath;
    }
  }
  return null;
}

function resolveAgentsMdPath(rootPath: string): string {
  return join(rootPath, AGENTS_MD_DIR, AGENTS_MD_FILE);
}

async function ensureAgentsDir(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, AGENTS_MD_DIR), { recursive: true });
}

async function readAgentsMdIfExists(path: string): Promise<string | null> {
  if (!existsSync(path)) {
    return null;
  }
  return readFile(path, "utf-8");
}

async function buildPackKey(
  index: { getPack: (packId: string) => Promise<{ id: string; updatedAt: number } | null> },
  packIds: string[]
): Promise<string | null> {
  const parts: string[] = [];
  for (const packId of packIds) {
    const pack = await index.getPack(packId);
    if (pack) {
      parts.push(`${pack.id}:${pack.updatedAt}`);
    }
  }
  return parts.length > 0 ? parts.join("|") : null;
}
