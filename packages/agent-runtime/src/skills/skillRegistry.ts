import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AuditLogger, SkillIndexEntry, SkillSource } from "../types";
import {
  normalizeSkillName,
  parseSkillMarkdown,
  type SkillValidationOptions,
} from "./skillParsing";

export type SkillDirectoryConfig = {
  path: string;
  source: SkillSource;
  originUrl?: string;
};

export type SkillRegistryOptions = {
  roots: SkillDirectoryConfig[];
  audit?: AuditLogger;
  cachePath?: string;
  validation?: SkillValidationOptions;
};

export type SkillValidationError = {
  path: string;
  reason: string;
};

export type SkillDiscoveryResult = {
  skills: SkillIndexEntry[];
  errors: SkillValidationError[];
};

const SKILL_FILENAMES = ["SKILL.md", "skill.md"];
const SKILL_CACHE_VERSION = 1;

type SkillCacheEntry = {
  skillFile: string;
  lastModifiedMs: number;
  entry: SkillIndexEntry;
};

type SkillCacheStore = {
  version: number;
  entries: SkillCacheEntry[];
};

type FileStat = {
  mtime: Date;
  mtimeMs: number;
};

const SOURCE_PRIORITY: Record<SkillSource, number> = {
  builtin: 4,
  org: 3,
  user: 2,
  third_party: 1,
};

export class SkillRegistry {
  private entries = new Map<string, SkillIndexEntry>();
  private disabled = new Set<string>();
  private errors: SkillValidationError[] = [];
  private readonly audit?: AuditLogger;
  private readonly roots: SkillDirectoryConfig[];
  private readonly cachePath?: string;
  private readonly validation?: SkillValidationOptions;
  private lastModifiedByFile = new Map<string, number>();

  constructor(options: SkillRegistryOptions) {
    this.roots = options.roots;
    this.audit = options.audit;
    this.cachePath = options.cachePath;
    this.validation = options.validation;
  }

  async discover(): Promise<SkillDiscoveryResult> {
    const discovered = new Map<string, SkillIndexEntry>();
    const errors: SkillValidationError[] = [];
    const cache = await this.loadCache();

    this.lastModifiedByFile.clear();

    for (const root of this.roots) {
      const skillDirs = await this.resolveSkillDirectories(root.path);
      for (const skillDir of skillDirs) {
        await this.processSkillDirectory({
          root,
          skillDir,
          cache,
          discovered,
          errors,
        });
      }
    }

    this.entries = discovered;
    this.errors = errors;

    this.pruneDisabledSkills();

    await this.saveCache();

    return { skills: this.list(), errors: [...this.errors] };
  }

  list(options?: { includeDisabled?: boolean }): SkillIndexEntry[] {
    const includeDisabled = options?.includeDisabled ?? false;
    const entries = Array.from(this.entries.values());
    const filtered = includeDisabled
      ? entries
      : entries.filter((entry) => !this.disabled.has(entry.skillId));
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  get(skillId: string): SkillIndexEntry | undefined {
    return this.entries.get(skillId);
  }

  disable(skillId: string): boolean {
    if (!this.entries.has(skillId)) {
      return false;
    }
    this.disabled.add(skillId);
    return true;
  }

  enable(skillId: string): boolean {
    return this.disabled.delete(skillId);
  }

  isDisabled(skillId: string): boolean {
    return this.disabled.has(skillId);
  }

  getErrors(): SkillValidationError[] {
    return [...this.errors];
  }

  private async resolveSkillDirectories(rootPath: string): Promise<string[]> {
    const resolvedRoot = path.resolve(rootPath);
    const rootFile = await this.findSkillFile(resolvedRoot);
    if (rootFile) {
      return [resolvedRoot];
    }

    try {
      const entries = await fs.readdir(resolvedRoot, { withFileTypes: true });
      const dirs: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        dirs.push(path.join(resolvedRoot, entry.name));
      }
      return dirs;
    } catch {
      return [];
    }
  }

  private async findSkillFile(skillDir: string): Promise<string | null> {
    for (const filename of SKILL_FILENAMES) {
      const fullPath = path.join(skillDir, filename);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          return fullPath;
        }
      } catch {
        // Ignore missing files.
      }
    }
    return null;
  }

  private async processSkillDirectory(options: {
    root: SkillDirectoryConfig;
    skillDir: string;
    cache: Map<string, SkillCacheEntry>;
    discovered: Map<string, SkillIndexEntry>;
    errors: SkillValidationError[];
  }): Promise<void> {
    const { root, skillDir, cache, discovered, errors } = options;
    const skillFile = await this.findSkillFile(skillDir);
    if (!skillFile) {
      return;
    }

    const cached = cache.get(skillFile);
    const usedCache = await this.tryUseCachedEntry({
      cached,
      root,
      skillDir,
      skillFile,
      discovered,
    });
    if (usedCache) {
      return;
    }

    const result = await this.buildIndexEntry(skillDir, skillFile, root);
    if (!result.success) {
      errors.push({ path: skillDir, reason: result.error });
      return;
    }

    this.recordEntry(discovered, result.entry, result.lastModifiedMs);
  }

  private async tryUseCachedEntry(options: {
    cached: SkillCacheEntry | undefined;
    root: SkillDirectoryConfig;
    skillDir: string;
    skillFile: string;
    discovered: Map<string, SkillIndexEntry>;
  }): Promise<boolean> {
    const { cached, root, skillDir, skillFile, discovered } = options;
    if (!cached) {
      return false;
    }

    const stat = await this.safeStat(skillFile);
    if (!stat) {
      return false;
    }

    const directoryName = path.basename(skillDir).normalize("NFKC");
    if (stat.mtimeMs !== cached.lastModifiedMs || directoryName !== cached.entry.name) {
      return false;
    }

    const entry = this.applyRootMetadata(cached.entry, root, skillDir, skillFile, stat);
    this.recordEntry(discovered, entry, stat.mtimeMs);
    return true;
  }

  private recordEntry(
    discovered: Map<string, SkillIndexEntry>,
    entry: SkillIndexEntry,
    lastModifiedMs: number
  ): void {
    this.lastModifiedByFile.set(entry.skillFile, lastModifiedMs);
    const existing = discovered.get(entry.skillId);
    if (!existing || SOURCE_PRIORITY[entry.source] > SOURCE_PRIORITY[existing.source]) {
      discovered.set(entry.skillId, entry);
    }
    this.emitDiscovery(entry);
  }

  private pruneDisabledSkills(): void {
    const existingIds = new Set(this.entries.keys());
    for (const skillId of this.disabled) {
      if (!existingIds.has(skillId)) {
        this.disabled.delete(skillId);
      }
    }
  }

  private async buildIndexEntry(
    skillDir: string,
    skillFile: string,
    root: SkillDirectoryConfig
  ): Promise<
    | { success: true; entry: SkillIndexEntry; lastModifiedMs: number }
    | { success: false; error: string }
  > {
    let content: string;
    try {
      content = await fs.readFile(skillFile, "utf-8");
    } catch (error) {
      return { success: false, error: this.describeError(error) };
    }

    const parsed = parseSkillMarkdown(content, this.validation);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }

    const directoryName = path.basename(skillDir).normalize("NFKC");
    if (directoryName !== parsed.frontmatter.name) {
      return { success: false, error: "Skill directory name must match skill name" };
    }

    const hash = createHash("sha256").update(content).digest("hex");
    let lastModified = new Date(0).toISOString();
    let lastModifiedMs = Date.now();

    try {
      const stat = await fs.stat(skillFile);
      lastModified = stat.mtime.toISOString();
      lastModifiedMs = stat.mtimeMs;
    } catch {
      lastModifiedMs = Date.now();
      lastModified = new Date(lastModifiedMs).toISOString();
    }

    const entry: SkillIndexEntry = {
      skillId: normalizeSkillName(parsed.frontmatter.name),
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: root.source,
      path: skillDir,
      skillFile,
      hash,
      lastModified,
      metadata: parsed.frontmatter.metadata,
      license: parsed.frontmatter.license,
      compatibility: parsed.frontmatter.compatibility,
      allowedTools: parsed.frontmatter.allowedTools,
      originUrl: root.originUrl,
    };

    return { success: true, entry, lastModifiedMs };
  }

  private applyRootMetadata(
    entry: SkillIndexEntry,
    root: SkillDirectoryConfig,
    skillDir: string,
    skillFile: string,
    stat: FileStat
  ): SkillIndexEntry {
    return {
      ...entry,
      source: root.source,
      originUrl: root.originUrl,
      path: skillDir,
      skillFile,
      lastModified: stat.mtime.toISOString(),
    };
  }

  private async safeStat(filePath: string): Promise<FileStat | null> {
    try {
      const stat = await fs.stat(filePath);
      return stat;
    } catch {
      return null;
    }
  }

  private async loadCache(): Promise<Map<string, SkillCacheEntry>> {
    if (!this.cachePath) {
      return new Map();
    }

    try {
      const content = await fs.readFile(this.cachePath, "utf-8");
      const parsed = JSON.parse(content) as SkillCacheStore;
      if (!parsed || parsed.version !== SKILL_CACHE_VERSION || !Array.isArray(parsed.entries)) {
        return new Map();
      }

      const map = new Map<string, SkillCacheEntry>();
      for (const entry of parsed.entries) {
        if (
          !entry ||
          typeof entry.skillFile !== "string" ||
          typeof entry.lastModifiedMs !== "number" ||
          !entry.entry
        ) {
          continue;
        }
        map.set(entry.skillFile, entry);
      }

      return map;
    } catch {
      return new Map();
    }
  }

  private async saveCache(): Promise<void> {
    if (!this.cachePath) {
      return;
    }

    const entries: SkillCacheEntry[] = [];
    for (const entry of this.entries.values()) {
      const lastModifiedMs = this.lastModifiedByFile.get(entry.skillFile);
      if (lastModifiedMs === undefined) {
        continue;
      }
      entries.push({ skillFile: entry.skillFile, lastModifiedMs, entry });
    }

    const store: SkillCacheStore = {
      version: SKILL_CACHE_VERSION,
      entries,
    };

    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.writeFile(this.cachePath, JSON.stringify(store, null, 2), "utf-8");
    } catch {
      // Ignore cache write failures.
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private emitDiscovery(entry: SkillIndexEntry): void {
    this.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.discovered",
      action: "result",
      input: { skillId: entry.skillId, source: entry.source, path: entry.path },
      output: { hash: entry.hash },
      sandboxed: false,
    });
  }
}

export function createSkillRegistry(options: SkillRegistryOptions): SkillRegistry {
  return new SkillRegistry(options);
}
