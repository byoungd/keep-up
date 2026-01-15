import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AuditLogger, SkillIndexEntry } from "../types";
import { parseSkillMarkdown } from "./skillParsing";
import type { SkillRegistry } from "./skillRegistry";

export type SkillLoadResult = {
  entry: SkillIndexEntry;
  content: string;
  body: string;
};

export type SkillResourceResult = {
  entry: SkillIndexEntry;
  content: string;
  resolvedPath: string;
};

export type SkillResolverOptions = {
  registry: SkillRegistry;
  audit?: AuditLogger;
};

export class SkillResolver {
  private readonly registry: SkillRegistry;
  private readonly audit?: AuditLogger;

  constructor(options: SkillResolverOptions) {
    this.registry = options.registry;
    this.audit = options.audit;
  }

  async loadSkill(skillId: string): Promise<SkillLoadResult | { error: string }> {
    if (this.registry.isDisabled(skillId)) {
      return { error: `Skill is disabled: ${skillId}` };
    }

    const entry = this.registry.get(skillId);
    if (!entry) {
      return { error: `Skill not found: ${skillId}` };
    }

    let content: string;
    try {
      content = await fs.readFile(entry.skillFile, "utf-8");
    } catch (error) {
      return { error: this.describeError(error) };
    }

    const parsed = parseSkillMarkdown(content);
    if (!parsed.success) {
      return { error: parsed.error };
    }

    if (parsed.frontmatter.name !== entry.name) {
      return { error: "Skill frontmatter does not match registry entry" };
    }

    return { entry, content, body: parsed.body };
  }

  async readResource(
    skillId: string,
    resourcePath: string,
    encoding: BufferEncoding = "utf-8"
  ): Promise<SkillResourceResult | { error: string }> {
    if (this.registry.isDisabled(skillId)) {
      return { error: `Skill is disabled: ${skillId}` };
    }

    const entry = this.registry.get(skillId);
    if (!entry) {
      return { error: `Skill not found: ${skillId}` };
    }

    const resolved = this.resolveResourcePath(entry, resourcePath);
    if (!resolved.success) {
      return { error: resolved.error };
    }

    try {
      const stat = await fs.stat(resolved.path);
      if (!stat.isFile()) {
        return { error: "Requested skill resource is not a file" };
      }
    } catch (error) {
      return { error: this.describeError(error) };
    }

    try {
      const content = await fs.readFile(resolved.path, encoding);
      this.emitResourceRead(entry, resourcePath, resolved.path);
      return { entry, content, resolvedPath: resolved.path };
    } catch (error) {
      return { error: this.describeError(error) };
    }
  }

  private emitResourceRead(
    entry: SkillIndexEntry,
    resourcePath: string,
    resolvedPath: string
  ): void {
    this.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.resource_read",
      action: "result",
      input: { skillId: entry.skillId, resourcePath },
      output: { resolvedPath },
      sandboxed: false,
    });
  }

  resolveResourcePath(
    entry: SkillIndexEntry,
    resourcePath: string
  ): { success: true; path: string } | { success: false; error: string } {
    if (path.isAbsolute(resourcePath)) {
      return { success: false, error: "Skill resource paths must be relative" };
    }

    const resolved = path.resolve(entry.path, resourcePath);
    const relative = path.relative(entry.path, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { success: false, error: "Skill resource path escapes skill root" };
    }

    return { success: true, path: resolved };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export function createSkillResolver(options: SkillResolverOptions): SkillResolver {
  return new SkillResolver(options);
}
