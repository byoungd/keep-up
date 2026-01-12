# Agent Planning Patterns Research Report

> **Date**: 2026-01-13
> **Scope**: OpenCode (SST) and Manus Agent best practices for "Planning with Files"
> **Goal**: Identify design patterns to optimize `@keepup/agent-runtime`

## Executive Summary

This report analyzes two leading AI agent implementations—**OpenCode** (by SST) and **Manus Agent**—to extract design patterns for file-based planning and state management. The analysis reveals several patterns that could significantly improve our current agent-runtime.

**Key Findings:**
1. **File-based planning directories** (`.opencode/plan/`) enable persistent, auditable plans
2. **Todo.md as progress tracker** with strict update discipline
3. **Numbered pseudocode planning** with step-by-step execution tracking
4. **Multi-agent specialization** with constrained permission sets
5. **Intermediate result persistence** to files rather than context window

---

## 1. OpenCode Architecture Analysis

### 1.1 Multi-Agent Design

OpenCode implements **role-specialized agents** with distinct permission boundaries:

| Agent | Mode | Key Constraint |
|-------|------|----------------|
| `build` | Primary | Full access, `question: allow` |
| `plan` | Primary | **Only edits `.opencode/plan/*.md`**, denies todo ops |
| `explore` | Subagent | Read-only, grep/glob/codesearch only |
| `general` | Subagent | Complex multi-step tasks, runs in parallel |

**Key Pattern: Constrained Plan Agent**
```typescript
// The plan agent can ONLY modify planning files
edit: {
  "*": "deny",
  ".opencode/plan/*.md": "allow",
}
```

This creates a "safe sandbox" for planning—the plan agent reasons without accidentally modifying production code.

### 1.2 File-Based Planning Directory

OpenCode uses `.opencode/plan/` as a dedicated planning workspace:
- Plans are written as **Markdown files**
- Plans are **version-controlled** with the codebase
- Plans are **auditable** and reviewable
- Plans **persist across sessions**

**Current Gap in Our Runtime:**
Our `PlanningEngine` holds plans in memory (`Map<string, ExecutionPlan>`), losing them on restart.

### 1.3 Permission Layering

Permissions merge in layers with clear precedence:
```
defaults → agent-specific → user config → guaranteed overrides
```

This enables progressive refinement while maintaining security baselines.

---

## 2. Manus Agent Architecture Analysis

### 2.1 The Agent Loop Pattern

Manus defines a strict iterative loop:

```
1. Analyze Events → Understand current state from event stream
2. Select Tool    → Choose ONE tool per iteration
3. Wait           → Tool executes in sandbox
4. Iterate        → Observe results, update planning
5. Submit         → Send results via message tools
6. Idle           → Signal completion
```

**Key Insight:** "Choose only one tool call per iteration" forces deliberate, observable execution rather than batching.

### 2.2 Planner Module with Numbered Pseudocode

Manus's planner provides task planning as events:
- Tasks use **numbered pseudocode** for execution steps
- Each update includes **current step number**, status, and reflection
- Agent must **complete all planned steps** and reach final step number

**Example Pattern:**
```
STEP 1: Analyze requirements [COMPLETE]
STEP 2: Search codebase for existing patterns [IN_PROGRESS]
STEP 3: Design data model
STEP 4: Implement core logic
STEP 5: Add tests
STEP 6: Update documentation
```

### 2.3 Todo.md Pattern (Critical)

This is Manus's most distinctive pattern:

```markdown
# todo.md Rules

1. Create todo.md as checklist based on task planning
2. Task planning takes precedence, todo.md has more details
3. Update markers IMMEDIATELY after completing each item
4. Rebuild when planning changes significantly
5. MUST use todo.md for information gathering tasks
6. Verify completion and remove skipped items when done
```

**Key Discipline:** Update markers via text replacement tool **immediately** after each item—not batched at the end.

### 2.4 Intermediate Result Persistence

> "Actively save intermediate results and store different types of reference information in separate files."

For lengthy documents:
1. Save each section as separate draft files
2. Append sections sequentially during final compilation
3. No content reduction during compilation

**Current Gap:** Our agents hold results in context window, risking loss on context overflow.

### 2.5 Knowledge and Datasource Modules

Manus injects task-relevant knowledge as **events in the stream**:
- Knowledge items have **scope conditions**
- Only adopt knowledge when conditions are met
- Data APIs must exist in event stream—**no fabrication**

---

## 3. Comparison with Current agent-runtime

### 3.1 Current Strengths

| Feature | Current Implementation | Status |
|---------|----------------------|--------|
| Multi-agent profiles | `AGENT_PROFILES` with 10 types | ✅ Good |
| Planning engine | `PlanningEngine` with steps/refinements | ✅ Good |
| Todo tool | `TodoToolServer` with .agent/TODO.md | ✅ Good |
| Context manager | Hierarchical with facts/cache | ✅ Good |
| Parallel execution | Dependency analysis + semaphore | ✅ Excellent |

### 3.2 Identified Gaps

| Gap | OpenCode/Manus Pattern | Priority |
|-----|----------------------|----------|
| Plans in memory only | File-based `.opencode/plan/` directory | **High** |
| No plan-only agent | Constrained plan agent with edit restrictions | **High** |
| Todo not integrated with planner | Todo.md as plan's "detailed checklist" | **Medium** |
| No intermediate file persistence | Save drafts/results to files proactively | **Medium** |
| No numbered step tracking | Numbered pseudocode with current step display | **Medium** |
| Single tool per turn not enforced | Deliberate one-tool-per-iteration discipline | **Low** |

---

## 4. Recommended Design Patterns to Adopt

### 4.1 Pattern: File-Based Plan Persistence

**Problem:** Plans are lost on session restart; no audit trail.

**Solution:** Persist plans to `.agent/plans/` directory.

```typescript
// Proposed structure
.agent/
├── TODO.md              # Detailed checklist (existing)
├── plans/
│   ├── current.md       # Active plan
│   ├── history/
│   │   └── 2026-01-13-feature-x.md
```

**Plan File Format:**
```markdown
# Plan: Implement feature X

## Goal
Add user authentication with JWT

## Steps
1. [ ] Research existing auth patterns in codebase
2. [/] Design JWT token structure  ← CURRENT
3. [ ] Implement token generation
4. [ ] Add middleware validation
5. [ ] Create login endpoint
6. [ ] Add tests

## Risk Assessment
Medium - touches security-sensitive code

## Files to Modify
- src/auth/jwt.ts
- src/middleware/auth.ts
- src/routes/login.ts
```

### 4.2 Pattern: Constrained Plan Agent

**Problem:** Planning agent might accidentally modify code.

**Solution:** Add a `plan` agent profile with edit restrictions.

```typescript
const PLAN_AGENT: AgentProfile = {
  type: "plan",
  name: "Plan Agent",
  allowedTools: [
    "file:read",
    "file:list",
    "todo:*",
    "plan:*"  // New plan tools
  ],
  // Key: Can only write to planning directory
  editRestrictions: {
    allow: [".agent/plans/**/*.md", ".agent/TODO.md"],
    deny: ["**/*"]
  },
  systemPrompt: PLAN_SYSTEM_PROMPT,
  securityPreset: "safe",
};
```

### 4.3 Pattern: Numbered Step Tracking

**Problem:** No visibility into which plan step is executing.

**Solution:** Add step number tracking to execution.

```typescript
interface PlanStep {
  // Existing fields...

  // New: Display state
  stepNumber: number;
  displayStatus: "pending" | "current" | "complete" | "failed";
  reflection?: string;  // Why this step succeeded/failed
}

// Emit step progress events
emit("plan:step:start", { stepNumber: 2, description: "Design JWT structure" });
emit("plan:step:complete", { stepNumber: 2, reflection: "Using RS256 for security" });
```

### 4.4 Pattern: Todo-Plan Integration

**Problem:** Todo list and plans are disconnected.

**Solution:** Make todo.md the "detailed view" of the current plan.

```typescript
class IntegratedPlanningEngine {
  // When plan is created, generate todo items
  async createPlan(plan: ExecutionPlan): Promise<void> {
    await this.persistPlan(plan);

    // Auto-generate todos from plan steps
    for (const step of plan.steps) {
      await this.todoServer.write({
        action: "add",
        text: step.description,
        priority: step.order <= 2 ? "high" : "medium",
        metadata: { planId: plan.id, stepId: step.id }
      });
    }
  }

  // When step completes, update todo
  async completeStep(planId: string, stepId: string): Promise<void> {
    const todo = await this.findTodoForStep(planId, stepId);
    if (todo) {
      await this.todoServer.write({ action: "complete", id: todo.id });
    }
  }
}
```

### 4.5 Pattern: Intermediate Result Files

**Problem:** Large results fill context window.

**Solution:** Proactively save intermediate results to files.

```typescript
// New tool: Save intermediate result
const saveIntermediateResult = {
  name: "save_intermediate",
  description: "Save intermediate result to file for later use",
  execute: async (args: { name: string; content: string }) => {
    const path = `.agent/scratch/${args.name}.md`;
    await fs.writeFile(path, args.content);
    return `Saved to ${path}. Reference with @file:${path}`;
  }
};

// Prompt instruction:
// "For lengthy analysis or data gathering, save results to .agent/scratch/
// rather than keeping in context. Reference saved files in your response."
```

### 4.6 Pattern: Knowledge Module

**Problem:** No structured way to inject task-relevant knowledge.

**Solution:** Add scoped knowledge injection.

```typescript
interface KnowledgeItem {
  id: string;
  scope: {
    when: string;  // "user mentions authentication"
    files?: string[];  // Only when these files are touched
  };
  content: string;
  priority: "high" | "medium" | "low";
}

// Example knowledge item
const AUTH_KNOWLEDGE: KnowledgeItem = {
  id: "auth-patterns",
  scope: {
    when: "implementing authentication or authorization",
    files: ["**/auth/**", "**/middleware/**"]
  },
  content: `
    This codebase uses:
    - JWT with RS256 signing
    - Refresh token rotation
    - Session stored in Redis
    See: docs/architecture/auth.md
  `,
  priority: "high"
};
```

---

## 5. Implementation Roadmap

### Phase 1: File-Based Planning (High Priority)

1. Create `.agent/plans/` directory structure
2. Add `plan:save`, `plan:load`, `plan:list` tools
3. Modify `PlanningEngine` to persist to filesystem
4. Add plan history with timestamps

### Phase 2: Constrained Plan Agent (High Priority)

1. Add `plan` agent type to `AGENT_PROFILES`
2. Implement edit restriction enforcement in tool executor
3. Add plan-specific system prompt with constraints
4. Test isolation between planning and execution

### Phase 3: Todo-Plan Integration (Medium Priority)

1. Link todo items to plan steps via metadata
2. Auto-generate todos when plan is created
3. Auto-complete todos when steps finish
4. Add `plan:status` tool showing current step

### Phase 4: Intermediate Results (Medium Priority)

1. Add `.agent/scratch/` directory for temporary files
2. Add `save_intermediate` tool
3. Modify prompt to encourage file-based intermediate storage
4. Add cleanup mechanism for old scratch files

### Phase 5: Knowledge Module (Lower Priority)

1. Define `KnowledgeItem` schema
2. Create knowledge registry with scope matching
3. Inject relevant knowledge into system prompt per-turn
4. Add user-definable knowledge in `.agent/knowledge/`

---

## 6. Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Request                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Plan Agent (Read-Only)                        │
│  • Analyzes request                                              │
│  • Writes plan to .agent/plans/current.md                        │
│  • Generates TODO items                                          │
│  • Cannot modify production code                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 .agent/ Directory (Persistent)                   │
│  ├── plans/                                                      │
│  │   ├── current.md          ← Active plan with steps           │
│  │   └── history/            ← Completed plans                  │
│  ├── TODO.md                 ← Detailed checklist               │
│  ├── scratch/                ← Intermediate results             │
│  └── knowledge/              ← Scoped knowledge items           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Orchestrator (Step-by-Step Execution)              │
│  • Reads current plan step                                       │
│  • Dispatches to appropriate agent (code, bash, explore)         │
│  • Updates TODO on step completion                               │
│  • Saves intermediate results to scratch/                        │
│  • Emits step progress events                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Specialized Agents (Execution)                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │  Code   │  │  Bash   │  │ Explore │  │ Research │            │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent   │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Takeaways

1. **Plans should live in files, not memory** — enables persistence, auditing, and resumption
2. **Planning and execution should be separated** — constrained plan agent prevents accidents
3. **Todo.md is the "live dashboard"** — update immediately, not in batches
4. **Save intermediate results proactively** — don't trust context window capacity
5. **Numbered steps with current indicator** — provides clear progress visibility
6. **Knowledge is scoped and conditional** — inject only when relevant

---

## References

- [OpenCode (SST)](https://github.com/sst/opencode) - Multi-agent architecture
- [Manus Agent System Prompt](https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9) - Leaked prompt analysis
- [Claude Code Agent SDK](https://docs.anthropic.com/en/docs/claude-code) - Reference patterns
