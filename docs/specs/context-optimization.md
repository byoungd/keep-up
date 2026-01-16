# Context Engineering Optimization Spec

**Date**: 2026-01-16
**Status**: DRAFT
**Based on**: [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

## 1. Overview

This specification outlines the architectural changes required to optimize the `agent-runtime` package context management strategies. The goal is to maximize the "Attention Budget" of the LLM, mitigate "Context Rot", and enable long-horizon agent execution.

## 2. Analysis of Current Implementation

### 2.1 Current Strengths
- **Dynamic Prompt Construction**: `PromptBuilder` constructs prompts based on phases and task types.
- **Fact Tracking**: `ContextManager` tracks "facts" and "touched files".
- **Tool Awareness**: Tools are dynamically injected.

### 2.2 Areas for Optimization
- **Prompt Structure**: Currently uses loose Markdown sections separated by `---`. Anthropic recommends strict XML tagging (`<background>`, `<instructions>`, etc.) for better separation of concerns.
- **Context Management**:
    - No mechanism for **Compaction** (summarizing history and resetting context).
    - No explicit **Structured Note-taking** (Agent Memory/Scratchpad) that persists across compactions.
    - Tool results are kept in history indefinitely, contributing to context pollution.
- **Retrieval**: Defaults to loading content. Needs to shift to "Just-in-Time" retrieval with lightweight identifiers (file paths).

## 3. Specification

### 3.1 XML-Structured System Prompts

Refactor `PromptBuilder` to output a strictly structured system prompt using XML tags. This helps the model distinguish between instructions, context, and tool definitions.

**Proposed Structure:**

```xml
<agent_configuration>
  <role>...</role>
  <capabilities>...</capabilities>
</agent_configuration>

<task_context>
  <user_request>...</user_request>
  <current_phase>PLANNING | EXECUTION | VERIFICATION</current_phase>
  <working_directory>...</working_directory>
</task_context>

<memory>
  <facts>...</facts>
  <scratchpad>...</scratchpad>
</memory>

<tools>
  <tool_definitions>...</tool_definitions>
  <guidelines>...</guidelines>
</tools>

<response_format>
...
</response_format>
```

### 3.2 Context Compaction & Management

Implement a **Compaction Strategy** to handle long-horizon tasks.

**Mechanism:**
1.  **Monitor Token Count**: Track accumulated tokens in the current "Turn".
2.  **Trigger**: When `total_tokens > TARGET_THRESHOLD` (e.g., 20k or 70% of window).
3.  **Compaction Process**:
    - **Summarize**: Ask the LLM to summarize the conversation history, preserving:
        - Key architectural decisions.
        - Completed steps.
        - Pending items.
        - "Known Unknowns".
    - **Persist**: Update `context.facts` and `context.scratchpad` with this summary.
    - **Reset**: Clear the `messages` array.
    - **Re-Seed**: Inject a fresh System Prompt + Updated Memory + Last User Message.

### 3.3 Agentic Memory (Structured Note-taking)

Expand `AgentContext` to include explicit memory structures that persist *outside* the message history.

**Interface Update:**

```typescript
interface AgentContext {
  // ... existing
  
  /** Unstructured persistent notes (The "Scratchpad" or "NOTES.md") */
  scratchpad: string;

  /** Structured goals/progress */
  progress: {
    completedSteps: string[];
    pendingSteps: string[];
    currentObjective: string;
  };
}
```

**Tooling**:
- The agent should have a tool (e.g., `update_memory`) or a convention to update this scratchpad.
- **Auto-Update**: Optionally, the runtime can auto-update the scratchpad based on `TaskBoundary` events.

### 3.4 Just-in-Time Retrieval Strategy

Encourage checking minimal context first.

- **Initial Context**: Do NOT dump file contents. Provide `ls -R` or tree structure of depth 2.
- **Guidelines**: Update `AGENTS_GUIDE_PROMPT` to explicitly instruct:
    - "Do not read full files unless necessary."
    - "Use `grep` or `find` to locate relevant code."
    - "Read only specific chunks if possible."

### 3.5 Tool Output Pruning

Implement `HistoryCleaner`:
- After `N` turns, replace the *output* of verbose tools (like `read_file` or `search`) with a placeholder `[Content truncated: 120 lines]`.
- Keep the *input* (the intent) visible.
- Assumption: If the agent needed it, it should have extracted relevant info into `Memory` or `Facts`.

## 4. Implementation Action Items

1.  **Modify `ActionContext`**: Add `scratchpad` and `progress` fields.
2.  **Refactor `PromptBuilder.build()`**:
    - Switch to XML template.
    - Inject `context.scratchpad` into `<memory>`.
3.  **Create `ContextCompactor` Service**:
    - Implement `summarizeHistory(messages: Message[]): Promise<string>`.
    - Implement `pruneHistory(messages: Message[])`.
4.  **Update `agentGuidelines.ts`**:
    - Add "Just-in-Time" retrieval best practices.
    - Add "Memory Management" instructions (tell agent to update scratchpad).

## 5. Migration Plan

1.  **Phase 1**: Update `PromptBuilder` to XML (low risk).
2.  **Phase 2**: Add `scratchpad` to Context and expose to Agent (medium risk).
3.  **Phase 3**: Implement Compaction Logic (high complexity, needs testing).

## 6. Technical Debt Fixes

### Fixed Type Safety Issues

1. **Factory Return Types**: Changed `createAuditLogger` and `createPermissionChecker` to return interface types (`AuditLogger`, `IPermissionChecker`) instead of concrete implementations. This follows the Dependency Inversion Principle.

2. **Consistent Type Handling**: Fixed `resolveSkillOptions` in Kernel to properly handle the difference between `KernelConfig.skills` (required registry) and `CreateOrchestratorOptions.skills` (optional registry).

These changes eliminate 4 pre-existing TypeScript errors in the agent-runtime package.
