import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WorkflowTemplate } from "./index";
import { parseWorkflowMarkdown, type WorkflowValidationOptions } from "./workflowParsing";

export type WorkflowDirectoryConfig = {
  path: string;
};

export type WorkflowRegistryOptions = {
  roots: WorkflowDirectoryConfig[];
  validation?: WorkflowValidationOptions;
};

export type WorkflowValidationError = {
  path: string;
  reason: string;
};

export type WorkflowDiscoveryResult = {
  workflows: WorkflowTemplate[];
  errors: WorkflowValidationError[];
};

const WORKFLOW_FILENAMES = ["WORKFLOW.md", "workflow.md"];

export class WorkflowRegistry {
  private templates = new Map<string, WorkflowTemplate>();
  private errors: WorkflowValidationError[] = [];
  private readonly roots: WorkflowDirectoryConfig[];
  private readonly validation?: WorkflowValidationOptions;

  constructor(options: WorkflowRegistryOptions) {
    this.roots = options.roots;
    this.validation = options.validation;
  }

  async discover(): Promise<WorkflowDiscoveryResult> {
    const discovered = new Map<string, WorkflowTemplate>();
    const errors: WorkflowValidationError[] = [];

    for (const root of this.roots) {
      const workflowDirs = await this.resolveWorkflowDirectories(root.path);
      for (const workflowDir of workflowDirs) {
        await this.processWorkflowDirectory({
          workflowDir,
          discovered,
          errors,
        });
      }
    }

    this.templates = discovered;
    this.errors = errors;
    return { workflows: this.list(), errors: [...this.errors] };
  }

  list(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  get(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  getErrors(): WorkflowValidationError[] {
    return [...this.errors];
  }

  private async resolveWorkflowDirectories(rootPath: string): Promise<string[]> {
    const resolvedRoot = path.resolve(rootPath);
    const rootFile = await this.findWorkflowFile(resolvedRoot);
    if (rootFile) {
      return [resolvedRoot];
    }

    try {
      const entries = await fs.readdir(resolvedRoot, { withFileTypes: true });
      const dirs: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(path.join(resolvedRoot, entry.name));
        }
      }
      return dirs;
    } catch {
      return [];
    }
  }

  private async findWorkflowFile(dir: string): Promise<string | null> {
    for (const filename of WORKFLOW_FILENAMES) {
      const fullPath = path.join(dir, filename);
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

  private async processWorkflowDirectory(options: {
    workflowDir: string;
    discovered: Map<string, WorkflowTemplate>;
    errors: WorkflowValidationError[];
  }): Promise<void> {
    const { workflowDir, discovered, errors } = options;
    const workflowFile = await this.findWorkflowFile(workflowDir);
    if (!workflowFile) {
      return;
    }

    let content = "";
    try {
      content = await fs.readFile(workflowFile, "utf-8");
    } catch (error) {
      errors.push({ path: workflowFile, reason: `Failed to read: ${String(error)}` });
      return;
    }

    const parsed = parseWorkflowMarkdown(content, this.validation);
    if (!parsed.success) {
      errors.push({ path: workflowFile, reason: parsed.error });
      return;
    }

    if (discovered.has(parsed.template.id)) {
      errors.push({
        path: workflowFile,
        reason: `Duplicate workflow id: ${parsed.template.id}`,
      });
      return;
    }

    discovered.set(parsed.template.id, parsed.template);
  }
}
