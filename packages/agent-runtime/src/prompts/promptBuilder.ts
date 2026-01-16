/**
 * Advanced Prompt Engineering System
 *
 * Dynamic, context-aware prompt construction based on Claude best practices.
 * Builds prompts that adapt to task type, available tools, and execution context.
 */

import type { MCPTool } from "../types";
import { AGENTS_GUIDE_PROMPT } from "./agentGuidelines";

// ============================================================================
// Prompt Types
// ============================================================================

/**
 * Prompt construction context.
 */
export interface PromptContext {
  /** Task description */
  task: string;
  /** Task type (if known) */
  taskType?: TaskType;
  /** Available tools */
  tools: MCPTool[];
  /** Current execution phase */
  phase: ExecutionPhase;
  /** Recent errors (for adaptive guidance) */
  recentErrors?: string[];
  /** Workflow being followed (if any) */
  workflow?: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
  /** Working directory */
  workingDirectory?: string;
  /** Agent memory (facts, scratchpad, progress) */
  memory?: AgentMemory;
}

/**
 * Task types for specialized prompting.
 */
export type TaskType =
  | "code_implementation"
  | "refactoring"
  | "debugging"
  | "testing"
  | "research"
  | "documentation"
  | "general";

/**
 * Execution phase.
 */
export type ExecutionPhase = "planning" | "execution" | "verification" | "refinement";

/**
 * Built prompt with metadata.
 */
export interface BuiltPrompt {
  /** Complete system prompt */
  systemPrompt: string;
  /** Prompt sections for tracking */
  sections: {
    agentConfiguration: string;
    taskContext: string;
    memory: string;
    tools: string;
    responseFormat: string;
  };
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Memory context for the agent.
 */
export interface AgentMemory {
  /** Facts learned during execution */
  facts: string[];
  /** Unstructured notes/scratchpad */
  scratchpad: string;
  /** Progress tracking */
  progress?: {
    completedSteps: string[];
    pendingSteps: string[];
    currentObjective: string;
  };
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Task-specific guidance.
 */
const TASK_PROMPTS: Record<TaskType, string> = {
  code_implementation: `
Code Implementation Guidelines:
- Write clean, maintainable code following the project's style
- Add appropriate comments for complex logic
- Consider error handling and edge cases
- Ensure type safety (use TypeScript properly)
- Follow SOLID principles`,

  refactoring: `
Refactoring Guidelines:
- Preserve existing functionality (no behavioral changes)
- Run tests before and after to ensure no regression
- Make small, incremental changes
- Improve code readability and maintainability
- Document why you're making each change`,

  debugging: `
Debugging Guidelines:
- First, reproduce the bug reliably
- Use systematic elimination to narrow down the cause
- Check recent changes that might have introduced the issue
- Add logging/debugging statements where needed
- Create a test case to prevent regression`,

  testing: `
Testing Guidelines:
- Write clear, descriptive test names
- Test both happy paths and error cases
- Aim for meaningful coverage, not just high percentages
- Use arrange-act-assert pattern
- Keep tests independent and isolated`,

  research: `
Research Guidelines:
- Start by understanding the question clearly
- Search relevant documentation and resources
- Synthesize findings into actionable insights
- Cite sources for key information
- Provide examples where applicable`,

  documentation: `
Documentation Guidelines:
- Write for your audience (beginners vs experts)
- Include practical examples
- Explain the "why" not just the "what"
- Keep documentation up-to-date with code
- Use clear, concise language`,

  general: `
General Guidelines:
- Understand the task thoroughly before starting
- Break complex tasks into smaller steps
- Communicate progress and findings clearly
- Ask for feedback when making significant decisions`,
};

/**
 * Phase-specific guidance.
 */
const PHASE_PROMPTS: Record<ExecutionPhase, string> = {
  planning: `
**Current Phase: Planning**

Before you execute any tools:
1. Analyze the task and break it down into steps
2. Identify what tools you'll need
3. Consider potential risks and edge cases
4. Create a clear execution plan
5. Present the plan for review if the task is complex or risky`,

  execution: `
**Current Phase: Execution**

As you work:
- Follow your plan step-by-step
- Verify each step before moving to the next
- Use git commits as checkpoints for major changes
- Run tests frequently to catch issues early
- Adapt your approach if you encounter unexpected issues`,

  verification: `
**Current Phase: Verification**

Verify your work:
- Run all relevant tests
- Check for TypeScript errors
- Verify the output matches requirements
- Review diffs for unintended changes
- Document what you've accomplished`,

  refinement: `
**Current Phase: Refinement**

Polish and improve:
- Address any test failures or linting issues
- Refactor for clarity where needed
- Ensure code follows project conventions
- Add missing error handling
- Update documentation if needed`,
};

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Dynamic prompt builder.
 */
export class PromptBuilder {
  private toolExamples = new Map<string, string>();

  /**
   * Register example usage for a tool.
   */
  registerToolExample(toolName: string, example: string): void {
    this.toolExamples.set(toolName, example);
  }

  /**
   * Build a complete prompt for the given context using XML structure.
   */
  build(context: PromptContext): BuiltPrompt {
    const sections = {
      agentConfiguration: this.buildAgentConfigSection(context),
      taskContext: this.buildTaskContextSection(context),
      memory: this.buildMemorySection(context),
      tools: this.buildToolsSection(context),
      responseFormat: this.buildResponseFormatSection(context),
    };

    // Combine all sections into XML-structured prompt
    const systemPrompt = [
      sections.agentConfiguration,
      sections.taskContext,
      sections.memory,
      sections.tools,
      sections.responseFormat,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      systemPrompt,
      sections,
      estimatedTokens: this.estimateTokens(systemPrompt),
    };
  }

  /**
   * Build agent configuration section (XML).
   */
  private buildAgentConfigSection(context: PromptContext): string {
    const taskType = context.taskType ?? this.inferTaskType(context.task);
    const taskGuidance = TASK_PROMPTS[taskType];
    const phaseGuidance = PHASE_PROMPTS[context.phase];

    return `<agent_configuration>
<role>
You are an expert AI coding assistant with deep knowledge of software engineering best practices.
</role>

<core_principles>
- Think step-by-step before acting
- Prefer incremental, testable changes over large rewrites
- Always verify your work through testing
- Communicate clearly about what you're doing and why
- Ask for clarification when requirements are ambiguous
</core_principles>

<constraints>
- You can only interact through the provided tools
- Always respect file permissions and security policies
- Provide helpful error messages when things go wrong
</constraints>

<operating_guidance>
${AGENTS_GUIDE_PROMPT}
</operating_guidance>

<task_type_guidance type="${taskType}">
${taskGuidance}
</task_type_guidance>

<phase_guidance phase="${context.phase}">
${phaseGuidance}
</phase_guidance>
</agent_configuration>`;
  }

  /**
   * Build task context section (XML).
   */
  private buildTaskContextSection(context: PromptContext): string {
    const workflow = context.workflow ? `\n<workflow>${context.workflow}</workflow>` : "";
    const workingDir = context.workingDirectory
      ? `\n<working_directory>${context.workingDirectory}</working_directory>`
      : "";

    return `<task_context>
<user_request>
${context.task}
</user_request>
<current_phase>${context.phase.toUpperCase()}</current_phase>${workingDir}${workflow}
</task_context>`;
  }

  /**
   * Build memory section (XML).
   */
  private buildMemorySection(context: PromptContext): string {
    const memory = context.memory;
    if (!memory) {
      return "<memory />";
    }

    const factsContent =
      memory.facts.length > 0 ? memory.facts.map((f) => `  <fact>${f}</fact>`).join("\n") : "";

    const progressContent = memory.progress
      ? `\n<progress>
  <current_objective>${memory.progress.currentObjective}</current_objective>
  <completed_steps>\n${memory.progress.completedSteps.map((s) => `    <step>${s}</step>`).join("\n")}\n  </completed_steps>
  <pending_steps>\n${memory.progress.pendingSteps.map((s) => `    <step>${s}</step>`).join("\n")}\n  </pending_steps>
</progress>`
      : "";

    return `<memory>
<facts>
${factsContent}
</facts>
<scratchpad>
${memory.scratchpad || "(empty)"}
</scratchpad>${progressContent}
</memory>`;
  }

  /**
   * Build tools section (XML).
   */
  private buildToolsSection(context: PromptContext): string {
    if (context.tools.length === 0) {
      return "<tools />";
    }

    const toolDefs = context.tools
      .map((tool) => `  <tool name="${tool.name}">${tool.description}</tool>`)
      .join("\n");

    // Add error-specific guidance if there are recent errors
    const errorGuidance =
      context.recentErrors && context.recentErrors.length > 0
        ? `\n<recent_issues>\n${context.recentErrors.map((e) => `  <issue>${e}</issue>`).join("\n")}\n</recent_issues>`
        : "";

    // Add tool examples if available
    const relevantExamples = this.getRelevantToolExamples(context.tools);
    const examplesContent =
      relevantExamples.length > 0
        ? `\n<tool_examples>\n${relevantExamples.join("\n")}\n</tool_examples>`
        : "";

    return `<tools>
<tool_definitions>
${toolDefs}
</tool_definitions>
<guidelines>
- Use just-in-time retrieval: Do not load full files unless necessary
- Use grep/find to locate relevant code before reading entire files
- Extract only the snippets you need
- Update your scratchpad/memory with important findings
</guidelines>${errorGuidance}${examplesContent}
</tools>`;
  }

  /**
   * Build response format section (XML).
   */
  private buildResponseFormatSection(context: PromptContext): string {
    const example = this.buildExamplesSection(context) || "";

    return `<response_format>
<guidelines>
- Think through your approach before taking action
- Execute tools systematically
- Report progress clearly
- If stuck, update scratchpad with observations before trying alternatives
</guidelines>
${example ? `<example_workflow>\n${example}\n</example_workflow>` : ""}
</response_format>`;
  }

  /**
   * Build task-specific guidance section.
   */
  private buildTaskSpecificSection(context: PromptContext): string {
    const taskType = context.taskType ?? this.inferTaskType(context.task);
    const baseGuidance = TASK_PROMPTS[taskType];

    // Add workflow-specific guidance if present
    if (context.workflow) {
      return `${baseGuidance}\n\n**Workflow: ${context.workflow}**\nFollow the phases of this workflow carefully, completing each before moving to the next.`;
    }

    return baseGuidance;
  }

  /**
   * Build tool guidance section.
   */
  private buildToolGuidanceSection(context: PromptContext): string {
    if (context.tools.length === 0) {
      return "";
    }

    const toolList = context.tools
      .map((tool) => `- **${tool.name}**: ${tool.description}`)
      .join("\n");

    let guidance = `**Available Tools:**\n${toolList}`;

    // Add error-specific guidance if there are recent errors
    if (context.recentErrors && context.recentErrors.length > 0) {
      guidance += `\n\n**Recent Issues:**\nYou encountered errors recently. Be extra careful with:\n${context.recentErrors.map((e) => `- ${e}`).join("\n")}`;
    }

    // Add tool examples if available
    const relevantExamples = this.getRelevantToolExamples(context.tools);
    if (relevantExamples.length > 0) {
      guidance += `\n\n**Tool Usage Examples:**\n${relevantExamples.join("\n\n")}`;
    }

    return guidance;
  }

  /**
   * Build phase-specific guidance section.
   */
  private buildPhaseGuidanceSection(context: PromptContext): string {
    return PHASE_PROMPTS[context.phase];
  }

  /**
   * Build examples section based on task type.
   */
  private buildExamplesSection(context: PromptContext): string | undefined {
    const taskType = context.taskType ?? this.inferTaskType(context.task);

    // Provide few-shot examples for complex task types
    if (taskType === "code_implementation") {
      return `**Example Workflow:**
1. Read existing code to understand context
2. Write tests for new functionality (TDD approach)
3. Implement the feature incrementally
4. Run tests to verify
5. Refactor for clarity`;
    }

    if (taskType === "debugging") {
      return `**Example Workflow:**
1. Reproduce the bug with a minimal test case
2. Add logging to narrow down the issue
3. Identify the root cause
4. Fix the issue
5. Verify the fix with tests
6. Add regression test`;
    }

    return undefined;
  }

  /**
   * Get relevant tool examples.
   */
  private getRelevantToolExamples(tools: MCPTool[]): string[] {
    const examples: string[] = [];
    for (const tool of tools) {
      const example = this.toolExamples.get(tool.name);
      if (example) {
        examples.push(`**${tool.name}:**\n${example}`);
      }
    }
    return examples.slice(0, 3); // Limit to 3 examples to save tokens
  }

  /**
   * Infer task type from task description.
   */
  private inferTaskType(task: string): TaskType {
    const taskLower = task.toLowerCase();

    if (/(implement|add|create|build)/.test(taskLower)) {
      return "code_implementation";
    }
    if (/(refactor|clean|improve|reorganize)/.test(taskLower)) {
      return "refactoring";
    }
    if (/(fix|bug|error|issue|debug)/.test(taskLower)) {
      return "debugging";
    }
    if (/(test|spec|coverage)/.test(taskLower)) {
      return "testing";
    }
    if (/(research|investigate|analyze|explore)/.test(taskLower)) {
      return "research";
    }
    if (/(document|comment|readme|guide)/.test(taskLower)) {
      return "documentation";
    }

    return "general";
  }

  /**
   * Estimate token count (rough approximation).
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a prompt builder.
 */
export function createPromptBuilder(): PromptBuilder {
  const builder = new PromptBuilder();

  // Register default tool examples
  builder.registerToolExample(
    "file:read",
    `// Read a file
const content = await tools.file.read({ path: "src/utils.ts" });`
  );

  builder.registerToolExample(
    "file:write",
    `// Write to a file (creates parent dirs if needed)
await tools.file.write({
  path: "src/newFile.ts",
  content: code,
  createDirs: true
});`
  );

  builder.registerToolExample(
    "bash:exec",
    `// Run tests
const result = await tools.bash.exec({ command: "npm test" });

// Check for errors
const typeCheck = await tools.bash.exec({ command: "npx tsc --noEmit" });`
  );

  builder.registerToolExample(
    "git:commit",
    `// Commit changes with meaningful message
await tools.git.commit({
  message: "feat: implement user authentication",
  files: ["src/auth.ts", "src/auth.test.ts"]
});`
  );

  return builder;
}
