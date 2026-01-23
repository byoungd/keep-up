---
description: Parallel Track 1 - Core Agent Architecture (Subagents + Interactive Clarification)
---

# Track 1: Core Agent Architecture

**Focus**: TypeScript-based orchestrator enhancements for subagents and interactive clarification.

**Can be developed in parallel with Track 2.**

## Prerequisites

- Ensure `packages/core` builds successfully
- Review existing orchestrator architecture
- Create feature branch

## Setup

```bash
git checkout -b feat/track1-core-architecture
```

---

## Phase 1: Subagents Architecture (Week 1-2)

### Step 1.1: Type Definitions

Create `packages/core/src/agent-runtime/orchestrator/subagents/types.ts`:

```typescript
export interface SubagentConfig {
  type: 'codebase-research' | 'terminal-executor' | 'parallel-work' | 'custom';
  name: string;
  prompt?: string;
  tools: string[];
  model?: string;
  maxConcurrency?: number;
  timeout?: number;
}

export interface SubagentResult<T = unknown> {
  success: boolean;
  output: T;
  context: Record<string, unknown>;
  executionTime: number;
  error?: Error;
}

export interface SubagentTask {
  id: string;
  config: SubagentConfig;
  input: unknown;
  dependencies?: string[];
}
```

### Step 1.2: Subagent Manager Core

Create `packages/core/src/agent-runtime/orchestrator/subagentManager.ts`:

```typescript
export class SubagentManager {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly modelProvider: ModelProvider
  ) {}

  async executeSubagent<T>(task: SubagentTask): Promise<SubagentResult<T>> {
    const startTime = Date.now();
    const context = this.createIsolatedContext(task.config);
    const tools = this.resolveToolAccess(task.config.tools);

    try {
      const result = await this.runSubagent(task, context, tools);
      return {
        success: true,
        output: result,
        context: context.toJSON(),
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: null as T,
        context: context.toJSON(),
        executionTime: Date.now() - startTime,
        error: error as Error,
      };
    }
  }

  async executeParallel<T>(tasks: SubagentTask[]): Promise<SubagentResult<T>[]> {
    const sorted = this.topologicalSort(tasks);
    const results = new Map<string, SubagentResult<T>>();

    for (const batch of this.createBatches(sorted)) {
      const batchResults = await Promise.all(
        batch.map((task) => this.executeSubagent<T>(task))
      );
      
      batch.forEach((task, idx) => {
        results.set(task.id, batchResults[idx]);
      });
    }

    return tasks.map((task) => results.get(task.id)!);
  }

  private createIsolatedContext(config: SubagentConfig): AgentContext {
    // Create clean context with only necessary data
  }

  private topologicalSort(tasks: SubagentTask[]): SubagentTask[] {
    // Sort by dependencies
  }

  private createBatches(tasks: SubagentTask[]): SubagentTask[][] {
    // Group independent tasks for parallel execution
  }
}
```

### Step 1.3: Default Subagents

**Codebase Research** - `subagents/codebaseResearch.ts`:

```typescript
export class CodebaseResearchSubagent extends BaseSubagent {
  tools = ['grep_search', 'find_by_name', 'view_file_outline', 'view_code_item'];

  async research(query: string): Promise<CodebaseResearchResult> {
    // 1. Search files
    const files = await this.findRelevantFiles(query);
    
    // 2. Analyze structure
    const structure = await this.analyzeStructure(files);
    
    // 3. Build dependency graph
    const deps = await this.buildDependencyGraph(files);
    
    return { files, structure, dependencies: deps };
  }
}
```

**Terminal Executor** - `subagents/terminalExecutor.ts`:

```typescript
export class TerminalExecutorSubagent extends BaseSubagent {
  tools = ['run_command', 'command_status', 'send_command_input'];

  async execute(command: string): Promise<ExecutionResult> {
    // Safe command execution with output parsing
    const result = await this.runCommand(command);
    return this.parseOutput(result);
  }
}
```

**Parallel Work** - `subagents/parallelWork.ts`:

```typescript
export class ParallelWorkSubagent extends BaseSubagent {
  async coordinate(tasks: WorkTask[]): Promise<WorkResult[]> {
    // Execute multiple independent tasks in parallel
    return Promise.all(tasks.map((t) => this.executeTask(t)));
  }
}
```

### Step 1.4: Orchestrator Integration

Modify `packages/core/src/agent-runtime/orchestrator/orchestrator.ts`:

```typescript
export class AgentOrchestrator {
  private subagentManager: SubagentManager;

  async run(task: Task): Promise<TaskResult> {
    while (!this.isComplete(task)) {
      const step = await this.planNextStep(task);
      
      // Identify subagent opportunities
      const subTasks = this.identifySubagentTasks(step);
      
      if (subTasks.length > 0) {
        // Execute via subagents
        const results = await this.subagentManager.executeParallel(subTasks);
        this.integrateResults(step, results);
      } else {
        // Execute normally
        await this.executeStep(step);
      }
    }
  }

  private identifySubagentTasks(step: Step): SubagentTask[] {
    // Heuristics:
    // - "search for X" -> codebase-research
    // - "run tests" -> terminal-executor
    // - "implement A and B" -> parallel-work
  }
}
```

### Step 1.5: Tests

Create `__tests__/subagentManager.test.ts`:

```typescript
describe('SubagentManager', () => {
  test('executes single subagent', async () => {
    const manager = new SubagentManager(toolRegistry, modelProvider);
    const result = await manager.executeSubagent({
      id: 'task-1',
      config: { type: 'codebase-research', name: 'search', tools: ['grep_search'] },
      input: { query: 'authentication' },
    });
    
    expect(result.success).toBe(true);
    expect(result.executionTime).toBeGreaterThan(0);
  });

  test('executes parallel subagents with dependencies', async () => {
    const tasks = [
      { id: 'a', config: { type: 'codebase-research' }, input: {} },
      { id: 'b', config: { type: 'terminal-executor' }, input: {}, dependencies: ['a'] },
    ];
    
    const results = await manager.executeParallel(tasks);
    expect(results).toHaveLength(2);
    // Verify 'b' executed after 'a'
  });
});
```

**Run tests:**
```bash
pnpm --filter @ku0/core test subagent
```

---

## Phase 2: Interactive Clarification (Week 2-3)

### Step 2.1: Clarification Types

Create `packages/core/src/agent-runtime/types/clarification.ts`:

```typescript
export interface ClarificationRequest {
  id: string;
  question: string;
  context?: {
    taskId: string;
    relatedFiles?: string[];
    codeSnippet?: string;
  };
  options?: string[];
  timeout?: number;
  continueWorkWhileWaiting?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'blocking';
}

export interface ClarificationResponse {
  requestId: string;
  answer: string;
  selectedOption?: number;
  timestamp: number;
  responseTime: number;
}
```

### Step 2.2: Clarification Tool

Create `packages/core/src/agent-runtime/tools/clarificationTool.ts`:

```typescript
export class ClarificationTool implements Tool {
  name = 'ask_clarification_question';
  
  async execute(params: {
    question: string;
    options?: string[];
    continueWork?: boolean;
  }): Promise<ClarificationResponse> {
    const request = this.createRequest(params);
    
    await this.notificationBus.publish({
      type: 'clarification-request',
      data: request,
    });

    if (params.continueWork) {
      return this.createPendingPromise(request.id);
    }

    return this.waitForResponse(request.id);
  }
}
```

### Step 2.3: Clarification Manager

Create `packages/core/src/agent-runtime/orchestrator/clarificationManager.ts`:

```typescript
export class ClarificationManager {
  private pending = new Map<string, ClarificationRequest>();
  private responses = new Map<string, ClarificationResponse>();

  async ask(request: ClarificationRequest): Promise<string> {
    this.pending.set(request.id, request);
    
    if (request.priority === 'blocking') {
      return this.waitForResponse(request.id);
    }

    return this.scheduleResponseCheck(request.id);
  }

  async submitResponse(response: ClarificationResponse): Promise<void> {
    this.responses.set(response.requestId, response);
    this.pending.delete(response.requestId);
    this.eventEmitter.emit('clarification-answered', response);
  }

  getPendingQuestions(): ClarificationRequest[] {
    return Array.from(this.pending.values())
      .sort((a, b) => this.getPriority(b) - this.getPriority(a));
  }
}
```

### Step 2.4: Orchestrator Integration

Modify `orchestrator.ts` to support clarification:

```typescript
async run(task: Task): Promise<TaskResult> {
  while (!this.isComplete(task)) {
    const step = await this.planNextStep(task);
    
    if (this.needsClarification(step)) {
      const question = this.generateQuestion(step);
      
      // Ask non-blocking
      const answerPromise = this.clarificationManager.ask({
        ...question,
        continueWorkWhileWaiting: true,
      });

      // Do other work
      const independentWork = this.findIndependentWork(task);
      if (independentWork.length > 0) {
        await this.executeSteps(independentWork);
      }

      // Get answer
      const answer = await answerPromise;
      this.incorporateAnswer(step, answer);
    }

    await this.executeStep(step);
  }
}
```

### Step 2.5: UI Integration

Create `apps/cowork/client/components/ClarificationPanel.tsx`:

```typescript
export const ClarificationPanel: React.FC = () => {
  const [questions, setQuestions] = useState<ClarificationRequest[]>([]);

  useEffect(() => {
    const unsub = agentBus.subscribe('clarification-request', (req) => {
      setQuestions((prev) => [...prev, req]);
    });
    return unsub;
  }, []);

  const handleAnswer = async (id: string, answer: string) => {
    await runtime.submitClarification({ requestId: id, answer, timestamp: Date.now() });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <ClarificationCard key={q.id} question={q} onAnswer={handleAnswer} />
      ))}
    </div>
  );
};
```

### Step 2.6: Tests

Create `__tests__/clarification.integration.test.ts`:

```typescript
test('agent asks question and continues work', async () => {
  const orch = new AgentOrchestrator();
  
  const taskPromise = orch.run({
    description: 'Implement auth (OAuth or JWT?)',
  });

  const question = await waitForClarification();
  expect(question.question).toContain('OAuth or JWT');

  // Agent should still be working
  expect(orch.isActive).toBe(true);

  await submitAnswer(question.id, 'OAuth');
  
  const result = await taskPromise;
  expect(result.implementation).toContain('OAuth');
});
```

---

## Integration & Testing

### Type Check
```bash
pnpm --filter @ku0/core typecheck
```

### Lint
```bash
pnpm --filter @ku0/core lint
```

### Full Test Suite
```bash
pnpm --filter @ku0/core test
```

### Manual Verification

**Test 1: Subagents Parallel Execution**

Prompt: "Analyze authentication system and run all tests"

Expected:
- Codebase research subagent finds files
- Terminal executor runs tests in parallel
- Results aggregated and presented

**Test 2: Non-blocking Clarification**

Prompt: "Add user profile page. Use Gravatar or file upload for avatar?"

Expected:
- Question appears in UI
- Agent continues implementing form, layout
- After answer, completes avatar component

---

## Commit & PR

```bash
git add .
git commit -m "feat(orchestrator): implement core agent architecture

Track 1: Subagents + Interactive Clarification

- SubagentManager for parallel task execution
- Default subagents: codebase-research, terminal-executor, parallel-work
- ClarificationTool for non-blocking user questions
- ClarificationManager for queue management
- Orchestrator integration for both features
- UI components for clarification display
- Comprehensive tests"

git push origin feat/track1-core-architecture

gh pr create \
  --title "feat(orchestrator): Track 1 - Core Agent Architecture" \
  --body "**Implements Track 1 from agent optimization plan**

**Features:**
- Subagents for parallel execution
- Interactive clarification with non-blocking mode
- Full orchestrator integration

**Can merge independently of Track 2**"
```

## Success Criteria

- [ ] SubagentManager executes tasks in parallel
- [ ] Default subagents functional
- [ ] Clarification tool works in blocking/non-blocking modes
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Manual verification successful
- [ ] PR created
