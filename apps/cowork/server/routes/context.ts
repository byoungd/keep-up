/**
 * Project Context Routes
 *
 * API endpoints for project context analysis and AGENTS.md management.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AnalyzeOptions,
  analyzeProject,
  type CustomInstruction,
  createProjectContext,
  type GenerateOptions,
  generateAgentsMd,
  type ProjectContext,
  parseCustomInstructions,
} from "@ku0/project-context";
import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";

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
    const agentsMdPath = join(projectPath, AGENTS_MD_FILENAME);

    // Check if AGENTS.md exists
    if (existsSync(agentsMdPath)) {
      const content = readFileSync(agentsMdPath, "utf-8");

      // Parse custom instructions from existing file
      const customInstructions = parseCustomInstructions(content);

      // Re-analyze to get fresh data
      const analysis = await analyzeProject(projectPath);

      const context: ProjectContext = {
        analysis,
        customInstructions:
          customInstructions.length > 0
            ? customInstructions
            : createProjectContext(analysis).customInstructions,
        updatedAt: Date.now(),
        version: 1,
      };

      return c.json({
        ok: true,
        context,
        rawContent: content,
        exists: true,
      });
    }

    // Generate new context
    const analysis = await analyzeProject(projectPath);
    const context = createProjectContext(analysis);

    return c.json({
      ok: true,
      context,
      rawContent: null,
      exists: false,
    });
  });

  /**
   * POST /context/generate
   * Generate AGENTS.md content (without saving)
   */
  app.post("/context/generate", async (c) => {
    const body = (await readJsonBody(c)) as GenerateRequestBody | null;
    const projectPath = body?.path ?? deps.basePath ?? process.cwd();
    const options = body?.options ?? {};

    if (!existsSync(projectPath)) {
      return jsonError(c, 400, "Project path does not exist");
    }

    const analysis = await analyzeProject(projectPath);
    const context = createProjectContext(analysis);

    // Merge custom instructions if provided
    if (body?.customInstructions && Array.isArray(body.customInstructions)) {
      context.customInstructions = body.customInstructions as CustomInstruction[];
    }

    const content = generateAgentsMd(context, options);

    return c.json({
      ok: true,
      content,
      context,
    });
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

    const agentsMdPath = join(projectPath, AGENTS_MD_FILENAME);

    try {
      writeFileSync(agentsMdPath, content, "utf-8");
      return c.json({
        ok: true,
        path: agentsMdPath,
        savedAt: Date.now(),
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

    const agentsMdPath = join(projectPath, AGENTS_MD_FILENAME);

    // Get existing custom instructions if file exists
    let existingInstructions: CustomInstruction[] = [];
    if (existsSync(agentsMdPath)) {
      const existingContent = readFileSync(agentsMdPath, "utf-8");
      existingInstructions = parseCustomInstructions(existingContent);
    }

    // Re-analyze project
    const analysis = await analyzeProject(projectPath);
    const context = createProjectContext(analysis);

    // Preserve existing custom instructions
    if (existingInstructions.length > 0) {
      context.customInstructions = existingInstructions;
    }

    const content = generateAgentsMd(context);

    // Optionally auto-save
    const autoSave = body?.autoSave === true;
    if (autoSave) {
      writeFileSync(agentsMdPath, content, "utf-8");
    }

    return c.json({
      ok: true,
      content,
      context,
      saved: autoSave,
      path: autoSave ? agentsMdPath : null,
    });
  });

  return app;
}
