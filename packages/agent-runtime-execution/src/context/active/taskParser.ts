/**
 * Task Markdown Parser
 *
 * Parses task.md files to extract workflow state for auto-resume functionality.
 * Supports:
 * - Standard checkbox syntax: `[ ]`, `[x]`, `[/]`
 * - Nested tasks via indentation
 * - Section headers
 * - YAML frontmatter
 */

import type { TaskCheckboxStatus, TaskItem, TaskSection, WorkflowState } from "./types";

/** Regex patterns for parsing */
const PATTERNS = {
  /** YAML frontmatter delimiter */
  frontmatterDelimiter: /^---\s*$/,
  /** Markdown heading */
  heading: /^(#{1,6})\s+(.+)$/,
  /** Checkbox task item */
  checkbox: /^(\s*)[-*]\s+\[([ x/])\]\s+(.+)$/i,
};

interface ParseContext {
  sections: TaskSection[];
  inProgressTasks: TaskItem[];
  currentSection: TaskSection | null;
  taskStack: Array<{ item: TaskItem; level: number }>;
}

/**
 * Parse status character to TaskCheckboxStatus
 */
function parseStatus(char: string): TaskCheckboxStatus {
  const lower = char.toLowerCase();
  if (lower === "x") {
    return "completed";
  }
  if (lower === "/") {
    return "in_progress";
  }
  return "pending";
}

/**
 * Parse YAML frontmatter from lines
 */
function parseFrontmatter(lines: string[]): {
  metadata: Record<string, unknown>;
  endLine: number;
} {
  const metadata: Record<string, unknown> = {};
  let i = 1;

  while (i < lines.length && !lines[i].match(PATTERNS.frontmatterDelimiter)) {
    const line = lines[i].trim();
    const colonIndex = line.indexOf(":");

    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      } else if (!Number.isNaN(Number(value)) && value !== "") {
        value = Number(value);
      }

      metadata[key] = value;
    }
    i++;
  }

  return { metadata, endLine: i + 1 };
}

/**
 * Process a heading line
 */
function processHeading(match: RegExpMatchArray, lineNumber: number, ctx: ParseContext): void {
  if (ctx.currentSection) {
    ctx.sections.push(ctx.currentSection);
  }
  ctx.currentSection = {
    title: match[2].trim(),
    headingLevel: match[1].length,
    line: lineNumber,
    tasks: [],
  };
  ctx.taskStack.length = 0;
}

/**
 * Process a checkbox task line
 */
function processCheckbox(match: RegExpMatchArray, lineNumber: number, ctx: ParseContext): void {
  const indentLength = match[1].length;
  const level = Math.floor(indentLength / 2);
  const status = parseStatus(match[2]);
  const text = match[3].trim();

  const task: TaskItem = { text, status, level, line: lineNumber };

  if (status === "in_progress") {
    ctx.inProgressTasks.push(task);
  }

  // Pop stack until we find the parent level
  while (ctx.taskStack.length > 0 && ctx.taskStack[ctx.taskStack.length - 1].level >= level) {
    ctx.taskStack.pop();
  }

  if (ctx.taskStack.length > 0) {
    const parent = ctx.taskStack[ctx.taskStack.length - 1].item;
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(task);
  } else if (ctx.currentSection) {
    ctx.currentSection.tasks.push(task);
  } else {
    ctx.currentSection = {
      title: "Tasks",
      headingLevel: 1,
      line: 1,
      tasks: [task],
    };
  }

  ctx.taskStack.push({ item: task, level });
}

/**
 * Flatten all tasks from sections (including nested)
 */
function getAllTasks(sections: TaskSection[]): TaskItem[] {
  const result: TaskItem[] = [];

  function collectTasks(tasks: TaskItem[]) {
    for (const task of tasks) {
      result.push(task);
      if (task.children) {
        collectTasks(task.children);
      }
    }
  }

  for (const section of sections) {
    collectTasks(section.tasks);
  }

  return result;
}

/**
 * Parse a task.md file content into WorkflowState
 */
export function parseTaskMarkdown(
  content: string,
  sourcePath: string,
  lastModified?: Date
): WorkflowState {
  const lines = content.split("\n");
  let lineIndex = 0;
  let metadata: Record<string, unknown> = {};

  // Parse frontmatter if present
  if (lines[0]?.match(PATTERNS.frontmatterDelimiter)) {
    const result = parseFrontmatter(lines);
    metadata = result.metadata;
    lineIndex = result.endLine;
  }

  const ctx: ParseContext = {
    sections: [],
    inProgressTasks: [],
    currentSection: null,
    taskStack: [],
  };

  // Process each line
  for (; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    const headingMatch = line.match(PATTERNS.heading);
    if (headingMatch) {
      processHeading(headingMatch, lineNumber, ctx);
      continue;
    }

    const checkboxMatch = line.match(PATTERNS.checkbox);
    if (checkboxMatch) {
      processCheckbox(checkboxMatch, lineNumber, ctx);
    }
  }

  // Don't forget the last section
  if (ctx.currentSection) {
    ctx.sections.push(ctx.currentSection);
  }

  // Calculate progress
  const allTasks = getAllTasks(ctx.sections);
  const completed = allTasks.filter((t) => t.status === "completed").length;
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
  const pending = allTasks.filter((t) => t.status === "pending").length;
  const total = allTasks.length;

  return {
    sections: ctx.sections,
    inProgressTasks: ctx.inProgressTasks,
    currentTask: ctx.inProgressTasks[0] ?? null,
    progress: {
      completed,
      inProgress,
      pending,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    metadata,
    sourcePath,
    lastModified: lastModified ?? new Date(),
  };
}

/**
 * Check if a workflow has resumable state (in-progress tasks)
 */
export function hasResumableState(state: WorkflowState): boolean {
  return state.inProgressTasks.length > 0;
}

/**
 * Generate a resume prompt from workflow state
 */
export function generateResumePrompt(state: WorkflowState, thoughtSummary?: string): string {
  if (!hasResumableState(state)) {
    return "";
  }

  const lines: string[] = [
    "## Session Resume Context",
    "",
    `You are resuming a previous session. Progress: ${state.progress.percentage}% complete (${state.progress.completed}/${state.progress.total} tasks).`,
    "",
  ];

  if (state.currentTask) {
    lines.push("**Current Task (In Progress):**");
    lines.push(`- ${state.currentTask.text} (line ${state.currentTask.line})`);
    lines.push("");
  }

  if (state.inProgressTasks.length > 1) {
    lines.push("**Other In-Progress Tasks:**");
    for (const task of state.inProgressTasks.slice(1)) {
      lines.push(`- ${task.text}`);
    }
    lines.push("");
  }

  if (thoughtSummary) {
    lines.push("**Previous Thought Process:**");
    lines.push(thoughtSummary);
    lines.push("");
  }

  lines.push("Please continue from where you left off.");
  return lines.join("\n");
}
