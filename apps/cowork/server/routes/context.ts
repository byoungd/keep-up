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
import type { ContextIndexManager } from "../services/contextIndexManager";

const AGENTS_MD_DIR = ".cowork";
const AGENTS_MD_FILENAME = "AGENTS.md";

interface ContextRouteDeps {
  /** Base path for projects (optional, defaults to cwd) */
  basePath?: string;
  contextIndexManager?: ContextIndexManager;
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

interface SearchRequestBody {
  path?: string;
  query?: string;
  limit?: number;
  minScore?: number;
}

interface PackRequestBody {
  path?: string;
  name?: string;
  chunkIds?: string[];
}

interface PinsRequestBody {
  packIds?: string[];
}

export function createContextRoutes(deps: ContextRouteDeps = {}) {
  const app = new Hono();
  const resolveRootPath = (pathOverride?: string) => pathOverride ?? deps.basePath ?? process.cwd();
  const resolveIndex = (pathOverride?: string) => {
    if (!deps.contextIndexManager) {
      return null;
    }
    return deps.contextIndexManager.getIndex(resolveRootPath(pathOverride));
  };

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

  /**
   * POST /context/search
   * Perform semantic search over indexed project context.
   */
  app.post("/context/search", async (c) => {
    const body = (await readJsonBody(c)) as SearchRequestBody | null;
    const query = body?.query?.trim();
    if (!query) {
      return jsonError(c, 400, "Query is required");
    }

    const rootPath = resolveRootPath(body?.path);
    if (!existsSync(rootPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const index = resolveIndex(body?.path);
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }

    const results = await index.search(query, {
      limit: body?.limit,
      minScore: body?.minScore,
    });

    return c.json({
      ok: true,
      results: results.map((result) => ({
        score: result.score,
        chunk: {
          id: result.chunk.id,
          sourcePath: result.chunk.sourcePath,
          content: result.chunk.content,
          tokenCount: result.chunk.tokenCount,
          updatedAt: result.chunk.updatedAt,
        },
      })),
    });
  });

  /**
   * GET /context/packs
   * List all context packs.
   */
  app.get("/context/packs", async (c) => {
    const index = resolveIndex();
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }
    const packs = await index.listPacks();
    return c.json({ ok: true, packs });
  });

  /**
   * GET /context/packs/:packId
   * Fetch a single context pack by id.
   */
  app.get("/context/packs/:packId", async (c) => {
    const index = resolveIndex();
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }
    const packId = c.req.param("packId");
    const pack = await index.getPack(packId);
    if (!pack) {
      return jsonError(c, 404, "Context pack not found");
    }
    return c.json({ ok: true, pack });
  });

  /**
   * POST /context/packs
   * Create a new context pack.
   */
  app.post("/context/packs", async (c) => {
    const body = (await readJsonBody(c)) as PackRequestBody | null;
    const name = body?.name?.trim();
    const chunkIds = body?.chunkIds ?? [];
    if (!name) {
      return jsonError(c, 400, "Pack name is required");
    }
    if (!Array.isArray(chunkIds)) {
      return jsonError(c, 400, "chunkIds must be an array");
    }

    const index = resolveIndex(body?.path);
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }

    const pack = await index.createPack(name, chunkIds);
    return c.json({ ok: true, pack }, 201);
  });

  /**
   * PUT /context/packs/:packId
   * Update an existing context pack.
   */
  app.put("/context/packs/:packId", async (c) => {
    const body = (await readJsonBody(c)) as PackRequestBody | null;
    const index = resolveIndex(body?.path);
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }

    const packId = c.req.param("packId");
    const update = {
      name: body?.name?.trim(),
      chunkIds: body?.chunkIds,
    };

    if (update.chunkIds && !Array.isArray(update.chunkIds)) {
      return jsonError(c, 400, "chunkIds must be an array");
    }

    const pack = await index.updatePack(packId, update);
    if (!pack) {
      return jsonError(c, 404, "Context pack not found");
    }

    return c.json({ ok: true, pack });
  });

  /**
   * DELETE /context/packs/:packId
   * Delete a context pack.
   */
  app.delete("/context/packs/:packId", async (c) => {
    const index = resolveIndex();
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }

    const packId = c.req.param("packId");
    const deleted = await index.deletePack(packId);
    if (!deleted) {
      return jsonError(c, 404, "Context pack not found");
    }

    return c.json({ ok: true });
  });

  /**
   * GET /context/pins/:sessionId
   * Fetch pinned context packs for a session.
   */
  app.get("/context/pins/:sessionId", async (c) => {
    const index = resolveIndex();
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }
    const sessionId = c.req.param("sessionId");
    const pins = await index.getPins(sessionId);
    return c.json({ ok: true, pins });
  });

  /**
   * PUT /context/pins/:sessionId
   * Update pinned context packs for a session.
   */
  app.put("/context/pins/:sessionId", async (c) => {
    const body = (await readJsonBody(c)) as PinsRequestBody | null;
    if (!body || !Array.isArray(body.packIds)) {
      return jsonError(c, 400, "packIds must be an array");
    }

    const index = resolveIndex();
    if (!index) {
      return jsonError(c, 503, "Context index is unavailable");
    }

    const sessionId = c.req.param("sessionId");
    const pins = await index.setPins(sessionId, body.packIds);
    return c.json({ ok: true, pins });
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
