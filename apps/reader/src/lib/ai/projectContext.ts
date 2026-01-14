import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

import type {
  ProjectContextSection,
  ProjectContextSectionLabel,
  ProjectContextSnapshot,
  ProjectTaskSummary,
} from "@/lib/ai/projectContextTypes";

const ROOT_MARKERS = ["pnpm-workspace.yaml", "turbo.json", ".git"] as const;
const TASK_FILE = "task.md";
const PLAN_FILE = "implementation_plan.md";
const TASKS_DIR = path.join("docs", "tasks");
const BRAIN_DIR = path.join(".keep-up", "brain");

const MAX_SECTION_CHARS = {
  tasks: 3200,
  plan: 3200,
  docs: 2000,
  memory: 2000,
};
const MAX_TASK_DOCS = 3;
const MAX_MEMORY_FILES = 3;

const STATIC_DOCS: Array<{ label: ProjectContextSectionLabel; relativePath: string }> = [
  { label: "Project Docs", relativePath: path.join("docs", "tasks", "DEEP_ANALYSIS.md") },
  {
    label: "Project Docs",
    relativePath: path.join("docs", "specs", "engineering", "99_Normative_Index.md"),
  },
];
const EXCLUDED_TASK_DOCS = new Set(
  STATIC_DOCS.map((doc) => path.normalize(doc.relativePath)).filter((doc) =>
    doc.startsWith(`${TASKS_DIR}${path.sep}`)
  )
);

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function clampText(text: string, maxChars: number) {
  if (maxChars <= 0) {
    return { text: "", truncated: text.length > 0, originalLength: text.length };
  }
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }
  return { text: text.slice(0, maxChars), truncated: true, originalLength: text.length };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function makeBlockId(label: ProjectContextSectionLabel, sourcePath: string): string {
  const labelSlug = slugify(label);
  const pathSlug = slugify(sourcePath.replace(/\\/g, "/"));
  const labelPart = labelSlug || "context";
  const pathPart = pathSlug || "source";
  return `project_${labelPart}_${pathPart}`;
}

async function readFileSection(
  rootPath: string,
  relativePath: string,
  label: ProjectContextSectionLabel,
  maxChars: number,
  warnings: string[]
): Promise<ProjectContextSection | null> {
  const absolutePath = path.join(rootPath, relativePath);
  try {
    const content = await fsp.readFile(absolutePath, "utf8");
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }
    const clamped = clampText(trimmed, maxChars);
    return {
      label,
      text: clamped.text,
      sourcePath: relativePath,
      originalLength: clamped.originalLength,
      truncated: clamped.truncated,
      blockId: makeBlockId(label, relativePath),
    };
  } catch (_error) {
    warnings.push(`Missing context file: ${relativePath}`);
    return null;
  }
}

async function readTextFile(
  rootPath: string,
  relativePath: string,
  warnings: string[]
): Promise<string | null> {
  const absolutePath = path.join(rootPath, relativePath);
  try {
    const content = await fsp.readFile(absolutePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (_error) {
    warnings.push(`Missing context file: ${relativePath}`);
    return null;
  }
}

function parseTasks(markdown: string): ProjectTaskSummary[] {
  const lines = markdown.split(/\r?\n/);
  const tasks: ProjectTaskSummary[] = [];
  let current: ProjectTaskSummary | null = null;
  let inChecklist = false;

  const finalizeTask = () => {
    if (!current) {
      return;
    }
    current.isComplete =
      current.checklistTotal > 0 && current.checklistDone === current.checklistTotal;
    tasks.push(current);
  };

  for (const line of lines) {
    const taskTitle = parseTaskHeader(line);
    if (taskTitle) {
      finalizeTask();
      current = createTaskSummary(taskTitle, tasks.length + 1);
      inChecklist = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (isChecklistHeader(line)) {
      inChecklist = true;
      continue;
    }

    if (isSectionHeader(line) && !isChecklistHeader(line)) {
      inChecklist = false;
      continue;
    }

    if (!inChecklist) {
      continue;
    }

    const item = parseChecklistItem(line);
    if (!item) {
      continue;
    }

    applyChecklistItem(current, item);
  }

  finalizeTask();
  return tasks;
}

function parseTaskHeader(line: string): string | null {
  const match = line.match(/^#\s*Task:?\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

function isChecklistHeader(line: string): boolean {
  return /^##\s+Checklist/i.test(line);
}

function isSectionHeader(line: string): boolean {
  return /^##\s+/.test(line);
}

function parseChecklistItem(line: string): { isDone: boolean; text: string } | null {
  const match = line.match(/^-\s*\[( |x|X)\]\s+(.*)$/);
  if (!match) {
    return null;
  }
  return {
    isDone: match[1].toLowerCase() === "x",
    text: match[2].trim(),
  };
}

function createTaskSummary(title: string, index: number): ProjectTaskSummary {
  return {
    id: slugify(title) || `task-${index}`,
    title,
    checklistDone: 0,
    checklistTotal: 0,
    isComplete: false,
    openItems: [],
  };
}

function applyChecklistItem(task: ProjectTaskSummary, item: { isDone: boolean; text: string }) {
  task.checklistTotal += 1;
  if (item.isDone) {
    task.checklistDone += 1;
    return;
  }
  if (task.openItems.length < 3) {
    task.openItems.push(item.text);
  }
}

async function readTaskDocs(
  rootPath: string,
  warnings: string[]
): Promise<ProjectContextSection[]> {
  const taskDir = path.join(rootPath, TASKS_DIR);
  try {
    const entries = await fsp.readdir(taskDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({
        name: entry.name,
        absolutePath: path.join(taskDir, entry.name),
        relativePath: path.normalize(path.join(TASKS_DIR, entry.name)),
      }));

    const filesWithStats = await Promise.all(
      mdFiles.map(async (file) => {
        const stats = await fsp.stat(file.absolutePath);
        return { ...file, mtimeMs: stats.mtimeMs };
      })
    );

    const eligibleFiles = filesWithStats.filter(
      (file) => !EXCLUDED_TASK_DOCS.has(file.relativePath)
    );
    eligibleFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const selected = eligibleFiles.slice(0, MAX_TASK_DOCS);
    const sections: ProjectContextSection[] = [];

    for (const file of selected) {
      const content = await fsp.readFile(file.absolutePath, "utf8");
      const trimmed = content.trim();
      if (!trimmed) {
        continue;
      }
      const clamped = clampText(`# ${file.name}\n\n${trimmed}`, MAX_SECTION_CHARS.docs);
      sections.push({
        label: "Project Docs",
        text: clamped.text,
        sourcePath: file.relativePath,
        originalLength: clamped.originalLength,
        truncated: clamped.truncated,
        blockId: makeBlockId("Project Docs", file.relativePath),
      });
    }

    return sections;
  } catch (_error) {
    warnings.push("Unable to read docs/tasks directory");
    return [];
  }
}

async function readMemorySections(
  rootPath: string,
  warnings: string[]
): Promise<ProjectContextSection[]> {
  const memoryDir = path.join(rootPath, BRAIN_DIR);
  try {
    const entries = await fsp.readdir(memoryDir, { withFileTypes: true });
    const memoryFiles = entries
      .filter((entry) => entry.isFile() && /\.(md|txt|json)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_MEMORY_FILES);

    const sections: ProjectContextSection[] = [];
    for (const entry of memoryFiles) {
      const absolutePath = path.join(memoryDir, entry.name);
      const content = await fsp.readFile(absolutePath, "utf8");
      const trimmed = content.trim();
      if (!trimmed) {
        continue;
      }
      const clamped = clampText(`# ${entry.name}\n\n${trimmed}`, MAX_SECTION_CHARS.memory);
      const sourcePath = path.join(BRAIN_DIR, entry.name);
      sections.push({
        label: "Project Memory",
        text: clamped.text,
        sourcePath,
        originalLength: clamped.originalLength,
        truncated: clamped.truncated,
        blockId: makeBlockId("Project Memory", sourcePath),
      });
    }

    return sections;
  } catch (_error) {
    warnings.push("Project memory not found at .keep-up/brain");
    return [];
  }
}

export async function getProjectContextSnapshot(options?: {
  rootPath?: string;
}): Promise<ProjectContextSnapshot> {
  const warnings: string[] = [];
  const rootPath = options?.rootPath ?? findWorkspaceRoot(process.cwd());

  const sections: ProjectContextSection[] = [];
  const taskContent = await readTextFile(rootPath, TASK_FILE, warnings);
  const taskSection: ProjectContextSection | null = taskContent
    ? {
        label: "Project Tasks",
        ...clampText(taskContent, MAX_SECTION_CHARS.tasks),
        sourcePath: TASK_FILE,
        blockId: makeBlockId("Project Tasks", TASK_FILE),
      }
    : null;
  if (taskSection) {
    sections.push(taskSection);
  }

  const planSection = await readFileSection(
    rootPath,
    PLAN_FILE,
    "Project Plan",
    MAX_SECTION_CHARS.plan,
    warnings
  );
  if (planSection) {
    sections.push(planSection);
  }

  const memorySections = await readMemorySections(rootPath, warnings);
  sections.push(...memorySections);

  const staticDocs = await Promise.all(
    STATIC_DOCS.map((doc) =>
      readFileSection(rootPath, doc.relativePath, doc.label, MAX_SECTION_CHARS.docs, warnings)
    )
  );
  for (const doc of staticDocs) {
    if (doc) {
      sections.push(doc);
    }
  }

  const taskDocs = await readTaskDocs(rootPath, warnings);
  sections.push(...taskDocs);

  const tasks = taskContent ? parseTasks(taskContent) : [];

  return {
    sections,
    tasks,
    updatedAt: new Date().toISOString(),
    warnings,
  };
}
