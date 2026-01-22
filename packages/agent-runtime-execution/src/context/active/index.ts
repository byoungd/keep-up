/**
 * Active Context Module
 *
 * Provides workflow state management and auto-resume functionality.
 */

export {
  ActiveContextService,
  type ActiveContextServiceOptions,
  createActiveContextService,
} from "./activeContextService";

export {
  generateResumePrompt,
  hasResumableState,
  parseTaskMarkdown,
} from "./taskParser";

export type {
  MemoryCheckpoint,
  ResumePromptConfig,
  TaskCheckboxStatus,
  TaskItem,
  TaskSection,
  WorkflowState,
} from "./types";
