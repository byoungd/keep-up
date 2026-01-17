/**
 * Project Context Routes
 *
 * API endpoints for project context analysis and AGENTS.md management.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AnalyzeOptions,
  analyzeProject,
  type CustomInstruction,
  createProjectContext,
  type GenerateOptions,
  generateAgentsMd,
  parseCustomInstructions,
  parseNotes,
} from "@ku0/project-context";
import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";

const AGENTS_MD_DIR = ".cowork";
const AGENTS_MD_FILENAME = "AGENTS.md";

interface ContextRouteDeps {
  /** Base path for projects (optional, defaults to cwd) */
  basePath?: string;
}

/** Request body for POST /context/generate */
interface GenerateRequestBody {
  path?: string;
  options?: GenerateOptions;
  customInstructions?: CustomInstruction[];
}

/** Request body for POST /context/save */
interface SaveRequestBody {
  path?: string;
  content?: string;
}

/** Request body for POST /context/refresh */
interface RefreshRequestBody {
  path?: string;
  autoSave?: boolean;
}

export function createContextRoutes(deps: ContextRouteDeps = {}) {
  const app = new Hono();

  /**
   * GET /context/analyze
   * Analyze the project and return structured data
   */
  app.get("/context/analyze", async (c) => {
    const projectPath = c.req.query("path") ?? deps.basePath ?? process.cwd();
    const maxDepth = Number.parseInt(c.req.query("maxDepth") ?? "3", 10);

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const options: AnalyzeOptions = {
      maxDepth,
    };

    const analysis = await analyzeProject(projectPath, options);
    return c.json({ ok: true, analysis });
  });

  /**
   * GET /context
   * Get the current project context (from AGENTS.md if exists)
   */
  app.get("/context", async (c) => {
    const projectPath = c.req.query("path") ?? deps.basePath ?? process.cwd();
    const agentsMdPath = resolveAgentsMdPath(projectPath);

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const existing = await readAgentsMdIfExists(agentsMdPath);
    if (existing) {
      return c.json({ ok: true, content: existing.content, updatedAt: existing.updatedAt });
    }

    const { content } = await generateAgentsMdContent(projectPath, {}, null);
    await ensureAgentsDir(projectPath);
    await writeFile(agentsMdPath, content, "utf-8");

    return c.json({ ok: true, content, updatedAt: Date.now() });
  });

  /**
   * POST /context/generate
   * Generate AGENTS.md content and persist it
   */
  app.post("/context/generate", async (c) => {
    const body = (await readJsonBody(c)) as GenerateRequestBody | null;
    const projectPath = body?.path ?? deps.basePath ?? process.cwd();
    const options = body?.options ?? {};

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const agentsMdPath = resolveAgentsMdPath(projectPath);
    const existingContent = await readAgentsMdIfExists(agentsMdPath);
    const { content } = await generateAgentsMdContent(
      projectPath,
      options,
      existingContent?.content ?? null,
      body?.customInstructions
    );

    await ensureAgentsDir(projectPath);
    await writeFile(agentsMdPath, content, "utf-8");

    return c.json({ ok: true, content, updatedAt: Date.now() });
  });

  /**
   * POST /context/save
   * Save AGENTS.md to the project
   */
  app.post("/context/save", async (c) => {
    const body = (await readJsonBody(c)) as SaveRequestBody | null;
    const projectPath = body?.path ?? deps.basePath ?? process.cwd();
    const content = body?.content;

    if (!content) {
      return jsonError(c, 400, "Content is required");
    }

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const agentsMdPath = resolveAgentsMdPath(projectPath);

    try {
      await ensureAgentsDir(projectPath);
      await writeFile(agentsMdPath, content, "utf-8");
      return c.json({
        ok: true,
        content,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonError(c, 500, `Failed to save AGENTS.md: ${message}`);
    }
  });

  /**
   * POST /context/refresh
   * Regenerate AGENTS.md while preserving custom instructions
   */
  app.post("/context/refresh", async (c) => {
    const body = (await readJsonBody(c)) as RefreshRequestBody | null;
    const projectPath = body?.path ?? deps.basePath ?? process.cwd();

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const agentsMdPath = resolveAgentsMdPath(projectPath);
    const existingContent = await readAgentsMdIfExists(agentsMdPath);
    const { content } = await generateAgentsMdContent(
      projectPath,
      {},
      existingContent?.content ?? null
    );

    const autoSave = body?.autoSave === true;
    if (autoSave) {
      await ensureAgentsDir(projectPath);
      await writeFile(agentsMdPath, content, "utf-8");
    }

    return c.json({
      ok: true,
      content,
      updatedAt: Date.now(),
      saved: autoSave,
    });
  });

  return app;
}

function resolveAgentsMdPath(projectPath: string): string {
  return join(projectPath, AGENTS_MD_DIR, AGENTS_MD_FILENAME);
}

async function ensureAgentsDir(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, AGENTS_MD_DIR), { recursive: true });
}

type AgentsMdContent = { content: string; updatedAt: number };

async function readAgentsMdIfExists(path: string): Promise<AgentsMdContent | null> {
  if (!existsSync(path)) {
    return null;
  }

  const [content, stats] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
  return {
    content,
    updatedAt: stats.mtimeMs,
  };
}

async function generateAgentsMdContent(
  projectPath: string,
  options: GenerateOptions,
  existingContent: string | null,
  customInstructions?: CustomInstruction[]
): Promise<{ content: string }> {
  const analysis = await analyzeProject(projectPath);
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

  if (customInstructions && Array.isArray(customInstructions)) {
    context.customInstructions = customInstructions;
  }

  const content = generateAgentsMd(context, options);
  return { content };
}
