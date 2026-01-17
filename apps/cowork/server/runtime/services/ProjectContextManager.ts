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
import { truncateToTokenBudget } from "../utils/tokenEstimation";

type Logger = Pick<Console, "info" | "warn" | "error" | "debug">;

const AGENTS_MD_DIR = ".cowork";
const AGENTS_MD_FILE = "AGENTS.md";

export class ProjectContextManager {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = {
      ...logger,
      debug: logger.debug ? logger.debug.bind(logger) : () => undefined,
    };
  }

  async getContext(session: CoworkSession): Promise<string> {
    return this.loadProjectContext(session);
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

  private async loadProjectContext(session: CoworkSession): Promise<string> {
    const rootPath = resolveRootPath(session);
    if (!rootPath) {
      this.logger.warn("No root path found in session grants, skipping project context");
      return "";
    }

    const agentsMdPath = resolveAgentsMdPath(rootPath);

    try {
      if (existsSync(agentsMdPath)) {
        this.logger.debug("Loading project context from AGENTS.md");
        const content = await readFile(agentsMdPath, "utf-8");
        return truncateToTokenBudget(content, DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET);
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

      return truncateToTokenBudget(agentsMd, DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET);
    } catch (error) {
      this.logger.error("Error loading project context", { error });
      return "";
    }
  }
}

function resolveRootPath(session: CoworkSession): string | null {
  const rootPath = session.grants?.[0]?.rootPath;
  return rootPath ?? null;
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
