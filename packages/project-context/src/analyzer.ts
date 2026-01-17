/**
 * Project Analyzer
 *
 * Analyzes a project directory to extract tech stack, structure,
 * coding conventions, and patterns for AGENTS.md generation.
 */

import { access, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  AnalyzeOptions,
  CodingConvention,
  ConfigFile,
  ConfigFileType,
  DirectoryNode,
  ProjectAnalysis,
  ProjectPattern,
  TechCategory,
  TechStackItem,
} from "./types";
import { DEFAULT_ANALYZE_OPTIONS } from "./types";

/**
 * Async file existence check
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyze a project directory and return structured analysis
 */
export async function analyzeProject(
  rootPath: string,
  options: AnalyzeOptions = {}
): Promise<ProjectAnalysis> {
  const opts = { ...DEFAULT_ANALYZE_OPTIONS, ...options };

  const packageJson = await readPackageJson(rootPath);
  const configFiles = await detectConfigFiles(rootPath);
  const techStack = await detectTechStack(rootPath, packageJson);
  const structure = await buildDirectoryTree(rootPath, opts.maxDepth, opts.excludeDirs);
  const conventions = await extractConventions(rootPath, configFiles);
  const patterns = await detectPatterns(rootPath, techStack);

  return {
    name: packageJson?.name ?? basename(rootPath),
    rootPath,
    description: packageJson?.description,
    techStack,
    structure,
    conventions,
    patterns,
    configFiles,
    analyzedAt: Date.now(),
  };
}

/**
 * Read and parse package.json
 */
async function readPackageJson(rootPath: string): Promise<PackageJson | null> {
  const pkgPath = join(rootPath, "package.json");
  if (!(await pathExists(pkgPath))) {
    return null;
  }
  try {
    const content = await readFile(pkgPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

interface PackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: string;
}

/**
 * Detect configuration files in project root
 */
async function detectConfigFiles(rootPath: string): Promise<ConfigFile[]> {
  const configPatterns: Array<{ pattern: string; type: ConfigFileType }> = [
    { pattern: "package.json", type: "package-json" },
    { pattern: "tsconfig.json", type: "tsconfig" },
    { pattern: "tsconfig.*.json", type: "tsconfig" },
    { pattern: "biome.json", type: "biome" },
    { pattern: "biome.jsonc", type: "biome" },
    { pattern: ".eslintrc", type: "eslint" },
    { pattern: ".eslintrc.js", type: "eslint" },
    { pattern: ".eslintrc.json", type: "eslint" },
    { pattern: "eslint.config.js", type: "eslint" },
    { pattern: ".prettierrc", type: "prettier" },
    { pattern: "prettier.config.js", type: "prettier" },
    { pattern: "vite.config.ts", type: "vite" },
    { pattern: "vite.config.js", type: "vite" },
    { pattern: "webpack.config.js", type: "webpack" },
    { pattern: "turbo.json", type: "turbo" },
    { pattern: "Dockerfile", type: "docker" },
    { pattern: "docker-compose.yml", type: "docker" },
    { pattern: ".github/workflows/*.yml", type: "ci" },
  ];

  const files: ConfigFile[] = [];
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const match = configPatterns.find((p) => {
      if (p.pattern.includes("*")) {
        const regex = new RegExp(`^${p.pattern.replace("*", ".*")}$`);
        return regex.test(entry.name);
      }
      return p.pattern === entry.name;
    });

    if (match) {
      files.push({
        name: entry.name,
        path: entry.name,
        type: match.type,
      });
    }
  }

  // Check for CI workflows
  const workflowsPath = join(rootPath, ".github", "workflows");
  if (await pathExists(workflowsPath)) {
    try {
      const workflows = await readdir(workflowsPath);
      for (const wf of workflows) {
        if (typeof wf === "string" && (wf.endsWith(".yml") || wf.endsWith(".yaml"))) {
          files.push({
            name: wf,
            path: `.github/workflows/${wf}`,
            type: "ci",
          });
        }
      }
    } catch {
      // Ignore errors reading workflows directory
    }
  }

  return files;
}

/** Dependency detection config */
interface DepConfig {
  dep: string;
  name: string;
  category: TechCategory;
}

/** All detectable dependencies */
const DETECTABLE_DEPS: DepConfig[] = [
  // Frameworks
  { dep: "react", name: "React", category: "framework" },
  { dep: "next", name: "Next.js", category: "framework" },
  { dep: "vue", name: "Vue", category: "framework" },
  { dep: "svelte", name: "Svelte", category: "framework" },
  { dep: "hono", name: "Hono", category: "framework" },
  { dep: "express", name: "Express", category: "framework" },
  { dep: "fastify", name: "Fastify", category: "framework" },
  // Testing
  { dep: "vitest", name: "Vitest", category: "testing" },
  { dep: "jest", name: "Jest", category: "testing" },
  { dep: "mocha", name: "Mocha", category: "testing" },
  { dep: "playwright", name: "Playwright", category: "testing" },
  { dep: "cypress", name: "Cypress", category: "testing" },
  // Bundlers
  { dep: "vite", name: "Vite", category: "bundler" },
  { dep: "webpack", name: "Webpack", category: "bundler" },
  { dep: "esbuild", name: "esbuild", category: "bundler" },
  { dep: "rollup", name: "Rollup", category: "bundler" },
  { dep: "turbo", name: "Turborepo", category: "bundler" },
];

/**
 * Detect dependencies from package.json
 */
function detectDepsFromPackageJson(allDeps: Record<string, string>, stack: TechStackItem[]): void {
  // TypeScript
  if ("typescript" in allDeps) {
    stack.push({
      category: "language",
      name: "TypeScript",
      version: allDeps.typescript,
      detectedFrom: "package.json",
    });
  }

  // All other deps
  for (const config of DETECTABLE_DEPS) {
    if (config.dep in allDeps) {
      stack.push({
        category: config.category,
        name: config.name,
        version: allDeps[config.dep],
        detectedFrom: "package.json",
      });
    }
  }

  // Linting (special case for biome)
  if ("biome" in allDeps || "@biomejs/biome" in allDeps) {
    stack.push({
      category: "linting",
      name: "Biome",
      version: allDeps.biome ?? allDeps["@biomejs/biome"],
      detectedFrom: "package.json",
    });
  }
  if ("eslint" in allDeps) {
    stack.push({
      category: "linting",
      name: "ESLint",
      version: allDeps.eslint,
      detectedFrom: "package.json",
    });
  }
}

/**
 * Detect package manager from lock files
 */
async function detectPackageManager(rootPath: string): Promise<TechStackItem | null> {
  const managers: Array<{ file: string; name: string }> = [
    { file: "pnpm-lock.yaml", name: "pnpm" },
    { file: "yarn.lock", name: "Yarn" },
    { file: "package-lock.json", name: "npm" },
    { file: "bun.lockb", name: "Bun" },
  ];

  for (const mgr of managers) {
    if (await pathExists(join(rootPath, mgr.file))) {
      return {
        category: "package-manager",
        name: mgr.name,
        detectedFrom: mgr.file,
      };
    }
  }
  return null;
}

/**
 * Detect tech stack from package.json and config files
 */
async function detectTechStack(
  rootPath: string,
  packageJson: PackageJson | null
): Promise<TechStackItem[]> {
  const stack: TechStackItem[] = [];

  if (packageJson) {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    detectDepsFromPackageJson(allDeps, stack);
  }

  const pkgMgr = await detectPackageManager(rootPath);
  if (pkgMgr) {
    stack.push(pkgMgr);
  }

  return stack;
}

/**
 * Build directory tree structure
 */
async function buildDirectoryTree(
  dirPath: string,
  maxDepth: number,
  excludeDirs: string[],
  currentDepth = 0
): Promise<DirectoryNode> {
  const name = basename(dirPath);

  if (currentDepth >= maxDepth) {
    return { name, type: "directory", children: [] };
  }

  const children: DirectoryNode[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip excluded directories
      if (excludeDirs.includes(entry.name)) {
        continue;
      }

      // Skip hidden files/dirs (except important ones)
      if (entry.name.startsWith(".") && !isImportantDotFile(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const childPath = join(dirPath, entry.name);
        children.push(await buildDirectoryTree(childPath, maxDepth, excludeDirs, currentDepth + 1));
      } else if (entry.isFile() && isImportantFile(entry.name)) {
        children.push({ name: entry.name, type: "file" });
      }
    }
  } catch {
    // Ignore permission errors
  }

  // Sort: directories first, then files, alphabetically
  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return { name, type: "directory", children };
}

function isImportantDotFile(name: string): boolean {
  const important = [".github", ".env.example", ".gitignore", ".nvmrc"];
  return important.includes(name);
}

function isImportantFile(name: string): boolean {
  const important = [
    "package.json",
    "tsconfig.json",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "biome.json",
    "vite.config.ts",
    "turbo.json",
  ];
  return important.includes(name) || name.endsWith(".md") || name === "index.ts";
}

/**
 * Extract conventions from Biome config
 */
async function extractBiomeConventions(
  rootPath: string,
  biomeConfig: ConfigFile,
  conventions: CodingConvention[]
): Promise<void> {
  try {
    const content = await readFile(join(rootPath, biomeConfig.path), "utf-8");
    const config = JSON.parse(content) as BiomeConfig;

    if (config.linter?.rules?.suspicious?.noExplicitAny === "error") {
      conventions.push({
        category: "TypeScript",
        rule: "No explicit `any` type",
        source: biomeConfig.path,
      });
    }

    if (config.formatter?.indentStyle) {
      conventions.push({
        category: "Formatting",
        rule: `Indent style: ${config.formatter.indentStyle}`,
        source: biomeConfig.path,
      });
    }

    if (config.formatter?.indentWidth) {
      conventions.push({
        category: "Formatting",
        rule: `Indent width: ${config.formatter.indentWidth}`,
        source: biomeConfig.path,
      });
    }
  } catch {
    // Ignore parse errors
  }
}

/**
 * Extract conventions from tsconfig
 */
async function extractTsconfigConventions(
  rootPath: string,
  tsconfigFile: ConfigFile,
  conventions: CodingConvention[]
): Promise<void> {
  try {
    const content = await readFile(join(rootPath, tsconfigFile.path), "utf-8");
    const config = JSON.parse(content) as TsConfig;

    if (config.compilerOptions?.strict) {
      conventions.push({
        category: "TypeScript",
        rule: "Strict mode enabled",
        source: tsconfigFile.path,
      });
    }

    if (config.compilerOptions?.noImplicitAny) {
      conventions.push({
        category: "TypeScript",
        rule: "No implicit `any`",
        source: tsconfigFile.path,
      });
    }
  } catch {
    // Ignore parse errors
  }
}

/**
 * Extract coding conventions from config files
 */
async function extractConventions(
  rootPath: string,
  configFiles: ConfigFile[]
): Promise<CodingConvention[]> {
  const conventions: CodingConvention[] = [];

  const biomeConfig = configFiles.find((f) => f.type === "biome");
  if (biomeConfig) {
    await extractBiomeConventions(rootPath, biomeConfig, conventions);
  }

  const tsconfigFile = configFiles.find((f) => f.name === "tsconfig.json");
  if (tsconfigFile) {
    await extractTsconfigConventions(rootPath, tsconfigFile, conventions);
  }

  return conventions;
}

interface BiomeConfig {
  linter?: {
    rules?: {
      suspicious?: {
        noExplicitAny?: string;
      };
    };
  };
  formatter?: {
    indentStyle?: string;
    indentWidth?: number;
  };
}

interface TsConfig {
  compilerOptions?: {
    strict?: boolean;
    noImplicitAny?: boolean;
  };
}

/**
 * Detect feature-based architecture pattern
 */
async function detectFeatureBasedArchitecture(appsDir: string): Promise<ProjectPattern | null> {
  try {
    const apps = await readdir(appsDir);
    for (const app of apps) {
      if (typeof app !== "string") continue;
      const featuresDir = join(appsDir, app, "src", "features");
      if (await pathExists(featuresDir)) {
        return {
          name: "Feature-based Architecture",
          description: "Components organized by feature/domain",
          examples: [`apps/${app}/src/features/`],
        };
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Detect common project patterns
 */
async function detectPatterns(
  rootPath: string,
  techStack: TechStackItem[]
): Promise<ProjectPattern[]> {
  const patterns: ProjectPattern[] = [];

  // Monorepo detection
  if (await pathExists(join(rootPath, "pnpm-workspace.yaml"))) {
    patterns.push({
      name: "Monorepo (pnpm workspaces)",
      description: "Project uses pnpm workspaces for monorepo management",
      examples: ["pnpm-workspace.yaml"],
    });
  }

  if (techStack.some((t) => t.name === "Turborepo")) {
    patterns.push({
      name: "Turborepo",
      description: "Uses Turborepo for build orchestration",
      examples: ["turbo.json"],
    });
  }

  // Check for apps/ and packages/ structure
  const [hasApps, hasPackages] = await Promise.all([
    pathExists(join(rootPath, "apps")),
    pathExists(join(rootPath, "packages")),
  ]);
  if (hasApps && hasPackages) {
    patterns.push({
      name: "Apps + Packages Structure",
      description: "Separates applications from shared packages",
      examples: ["apps/", "packages/"],
    });
  }

  // Feature-based structure detection
  const appsDir = join(rootPath, "apps");
  if (hasApps) {
    const featurePattern = await detectFeatureBasedArchitecture(appsDir);
    if (featurePattern) {
      patterns.push(featurePattern);
    }
  }

  return patterns;
}
