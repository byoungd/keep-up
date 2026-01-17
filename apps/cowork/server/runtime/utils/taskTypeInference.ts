/**
 * Task type inference utilities
 */

import type { TaskType } from "@ku0/agent-runtime";

/**
 * Infer task type from prompt text using pattern matching
 */
export function inferTaskType(prompt: string): TaskType {
  const task = prompt.toLowerCase();

  if (/(implement|add|create|build)/.test(task)) {
    return "code_implementation";
  }
  if (/(refactor|clean|improve|optimi[sz]e|reorganize)/.test(task)) {
    return "refactoring";
  }
  if (/(fix|bug|error|issue|debug)/.test(task)) {
    return "debugging";
  }
  if (/(test|spec|coverage)/.test(task)) {
    return "testing";
  }
  if (/(research|investigate|analy[sz]e|explore|report)/.test(task)) {
    return "research";
  }
  if (/(document|comment|readme|guide|manual)/.test(task)) {
    return "documentation";
  }

  return "general";
}
