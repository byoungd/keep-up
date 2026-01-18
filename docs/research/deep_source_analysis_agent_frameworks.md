# [SUPERSEDED] Deep Source Code Analysis: Top AI Agent Frameworks

> **NOTE:** This document is now historical. The authoritative specification is at `docs/specs/agent-runtime-spec-2026.md`.

# Deep Source Code Analysis: Top AI Agent Frameworks

**Version**: 1.0  
**Date**: 2026-01-18  
**Author**: Antigravity Engineering Analysis  
**Status**: Complete Technical Analysis

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Framework Overview](#2-framework-overview)
3. [Core Dimension Analysis](#3-core-dimension-analysis)
4. [Source Code Pattern Extraction](#4-source-code-pattern-extraction)
5. [Comparative Matrix](#5-comparative-matrix)
6. [Keep-Up Gap Analysis](#6-keep-up-gap-analysis)
7. [Unified Architecture Design](#7-unified-architecture-design)
8. [Implementation Roadmap](#8-implementation-roadmap)

---

## 1. Executive Summary

This report provides a **source-code level deep analysis** of 6 leading open-source AI Agent frameworks:

| Framework | Language | Core Strength | Analyzed Files |
|-----------|----------|---------------|----------------|
| **OpenCode** | Go | Recursive Delegation, Agent-as-Tool | `agent.go`, `agent-tool.go` |
| **Gemini CLI** | TypeScript | Graceful Recovery, Final Warning | `local-executor.ts` |
| **AutoGen** | Python | Actor Model, Async Runtime | `_single_threaded_agent_runtime.py` |
| **MetaGPT** | Python | Role SOPs, Team Collaboration | `role.py`, `team.py` |
| **LangGraph** | Python | Graph State Machine, Checkpointing | `pregel/main.py` |
| **CrewAI** | Python | Hierarchical Delegation, Process Orchestration | `crew.py` |

### Key Findings

Top-tier Agent products share **4 critical architectural patterns**:

1. **Recursive Delegation** - Agents can be invoked as tools by other agents
2. **Graceful Recovery** - Never fail silently; always provide a meaningful result when limits are reached
3. **State Persistence** - Support 100% session recovery after interruption
4. **Role Specialization** - Role-based SOPs rather than generic prompts

---

## 2. Framework Overview

### 2.1 OpenCode (Go)

**Core Files**: `.tmp/analysis/opencode/internal/llm/agent/`

```go
// agent.go - Core Agent Structure
type agent struct {
    *pubsub.Broker[AgentEvent]
    sessions   session.Service
    messages   message.Service
    tools      []tools.BaseTool
    provider   provider.Provider
    activeRequests sync.Map  // Concurrency control
}

// Core Loop Pattern
func (a *agent) processGeneration(ctx context.Context, sessionID, content string, ...) AgentEvent {
    for {
        select {
        case <-ctx.Done():
            return a.err(ctx.Err())
        default:
        }
        agentMessage, toolResults, err := a.streamAndHandleEvents(ctx, sessionID, msgHistory)
        // Continue loop after tool execution
        if (agentMessage.FinishReason() == message.FinishReasonToolUse) && toolResults != nil {
            msgHistory = append(msgHistory, agentMessage, *toolResults)
            continue
        }
        return AgentEvent{Type: AgentEventTypeResponse, Message: agentMessage, Done: true}
    }
}
```

**Key Characteristics**:
- **Event-Driven Architecture**: Uses `pubsub.Broker` for event distribution
- **Session Isolation**: Each session is independently managed with cancellation support
- **Cost Aggregation**: Child agent costs automatically roll up to parent

### 2.2 Gemini CLI (TypeScript)

**Core Files**: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`

```typescript
// Final Warning Mechanism - Core Innovation
private async executeFinalWarningTurn(
    chat: GeminiChat,
    turnCounter: number,
    reason: AgentTerminateMode.TIMEOUT | AgentTerminateMode.MAX_TURNS | ...,
    externalSignal: AbortSignal,
): Promise<string | null> {
    const GRACE_PERIOD_MS = 60 * 1000; // 1 minute grace period
    
    const recoveryMessage: Content = {
        role: 'user',
        parts: [{ text: this.getFinalWarningMessage(reason) }],
    };
    
    // Give the agent one final chance to complete the task
    const turnResult = await this.executeTurn(chat, recoveryMessage, turnCounter, ...);
    
    if (turnResult.status === 'stop' && turnResult.terminateReason === AgentTerminateMode.GOAL) {
        return turnResult.finalResult ?? 'Task completed during grace period.';
    }
    return null;
}

// Warning Message Generation
private getFinalWarningMessage(reason: ...): string {
    let explanation = '';
    switch (reason) {
        case AgentTerminateMode.TIMEOUT:
            explanation = 'You have exceeded the time limit.';
            break;
        case AgentTerminateMode.MAX_TURNS:
            explanation = 'You have exceeded the maximum number of turns.';
            break;
    }
    return `${explanation} You have one final chance to complete the task. 
            You MUST call \`complete_task\` immediately with your best answer.`;
}
```

**Key Characteristics**:
- **Graceful Degradation**: Never fails silently; always produces meaningful output
- **Compression Service**: `ChatCompressionService` automatically manages context length
- **Telemetry Integration**: Complete tracing with `logAgentStart/Finish/RecoveryAttempt`

### 2.3 AutoGen (Python)

**Core Files**: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/`

```python
# _single_threaded_agent_runtime.py - Actor Model Runtime
class SingleThreadedAgentRuntime(AgentRuntime):
    def __init__(self, ...):
        self._message_queue: Queue[...] = Queue()  # Message queue
        self._agent_factories: Dict[str, Callable] = {}
        self._instantiated_agents: Dict[AgentId, Agent] = {}
        self._subscription_manager = SubscriptionManager()
    
    async def send_message(self, message: Any, recipient: AgentId, ...):
        """Direct message to specific agent"""
        future = asyncio.get_event_loop().create_future()
        await self._message_queue.put(SendMessageEnvelope(...))
        return await future
    
    async def publish_message(self, message: Any, topic_id: TopicId, ...):
        """Pub/Sub to all subscribers"""
        await self._message_queue.put(PublishMessageEnvelope(...))
    
    async def _process_next(self):
        """Core message processing loop"""
        message_envelope = await self._message_queue.get()
        match message_envelope:
            case SendMessageEnvelope(...):
                task = asyncio.create_task(self._process_send(message_envelope))
            case PublishMessageEnvelope(...):
                task = asyncio.create_task(self._process_publish(message_envelope))
```

**Key Characteristics**:
- **Actor Model**: Each agent is an independent actor communicating via messages
- **Subscription Management**: Topic-based pub/sub for loose coupling
- **State Save/Restore**: `save_state()` / `load_state()` support persistence

### 2.4 MetaGPT (Python)

**Core Files**: `.tmp/analysis/MetaGPT/metagpt/roles/role.py`

```python
class Role(BaseRole, SerializationMixin, ContextMixin, BaseModel):
    """Role/Agent Base Class"""
    
    name: str = ""
    profile: str = ""  # Role description
    goal: str = ""     # Goal
    constraints: str = ""  # Constraints
    actions: list[Action] = Field(default=[])  # Executable action list
    rc: RoleContext = Field(default_factory=RoleContext)  # Runtime context
    
    class RoleReactMode(str, Enum):
        REACT = "react"           # think-act loop
        BY_ORDER = "by_order"     # execute in order
        PLAN_AND_ACT = "plan_and_act"  # plan first, then execute

    async def _react(self) -> Message:
        """Standard ReAct Loop"""
        actions_taken = 0
        while actions_taken < self.rc.max_react_loop:
            has_todo = await self._think()  # Think about next step
            if not has_todo:
                break
            rsp = await self._act()  # Execute action
            actions_taken += 1
        return rsp
    
    async def _think(self) -> bool:
        """Use LLM to select next action"""
        prompt = STATE_TEMPLATE.format(
            history=self.rc.history,
            states="\n".join(self.states),
            n_states=len(self.states) - 1,
            previous_state=self.rc.state,
        )
        next_state = await self.llm.aask(prompt)
        self._set_state(int(next_state))
        return True
```

**Key Characteristics**:
- **Role Specialization**: Each role has explicit profile/goal/constraints
- **Action Orchestration**: Supports REACT, BY_ORDER, PLAN_AND_ACT modes
- **Environment Sharing**: Multi-role collaboration via `Environment`

### 2.5 LangGraph (Python)

**Core Files**: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`

```python
class Pregel(PregelProtocol[StateT, ContextT, InputT, OutputT]):
    """Graph Execution Engine based on Pregel Algorithm"""
    
    nodes: dict[str, PregelNode]
    channels: dict[str, BaseChannel | ManagedValueSpec]
    checkpointer: Checkpointer = None  # State persistence
    
    # Execution Model: Plan -> Execute -> Update
    # Each step contains three phases:
    # 1. Plan: Determine which nodes to execute
    # 2. Execute: Run all selected nodes in parallel
    # 3. Update: Update channel state
    
    def _prepare_state_snapshot(self, config, saved, ...):
        """Restore state from checkpoint"""
        channels, managed = channels_from_checkpoint(
            self.channels, saved.checkpoint,
        )
        next_tasks = prepare_next_tasks(
            saved.checkpoint, saved.pending_writes,
            self.nodes, channels, managed, ...
        )
        return StateSnapshot(...)
    
    def get_state(self, config, *, subgraphs=False):
        """Get current state snapshot - supports time travel"""
        saved = self.checkpointer.get_tuple(config)
        return self._prepare_state_snapshot(config, saved, ...)
```

**Key Characteristics**:
- **DAG Execution**: Graph execution based on Pregel/BSP model
- **Channel Communication**: State transfer between nodes via Channels
- **Checkpointing**: Persistence after each step, supports recovery and time-travel debugging

### 2.6 CrewAI (Python)

**Core Files**: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`

```python
class Crew(FlowTrackable, BaseModel):
    """Crew: Agent Team Collaboration Orchestration"""
    
    tasks: list[Task] = Field(default_factory=list)
    agents: list[BaseAgent] = Field(default_factory=list)
    process: Process = Field(default=Process.sequential)  # sequential | hierarchical
    memory: bool = Field(default=False)
    manager_agent: BaseAgent | None = None  # Manager in hierarchical mode
    
    def kickoff(self, inputs: dict[str, Any] | None = None):
        """Start Crew execution"""
        if self.process == Process.sequential:
            result = self._run_sequential_process()
        elif self.process == Process.hierarchical:
            result = self._run_hierarchical_process()
        return result
    
    # Hierarchical mode: manager_agent assigns tasks to other agents
    # Sequential mode: execute tasks in list order
```

**Key Characteristics**:
- **Process Orchestration**: Sequential and Hierarchical modes
- **Task Dependencies**: Support `context` to specify inter-task dependencies
- **Streaming**: Native streaming output support

---

## 3. Core Dimension Analysis

### 3.1 Agent Loop Mechanism Comparison

| Framework | Loop Type | Termination Condition | Timeout Handling |
|-----------|-----------|----------------------|------------------|
| OpenCode | `for {}` + select | FinishReason | context.Cancel |
| Gemini CLI | `while (true)` | complete_task tool | **GracefulRecovery** |
| AutoGen | Message Queue | No new messages | CancellationToken |
| MetaGPT | `while actions_taken < max` | `_think()` returns false | max_react_loop |
| LangGraph | Step-based DAG | No next tasks | step_timeout |
| CrewAI | Task iteration | All Tasks complete | No explicit handling |

### 3.2 State Persistence Comparison

| Framework | Persistence Method | Recovery Capability | Time Travel |
|-----------|-------------------|---------------------|-------------|
| OpenCode | Session DB | ✅ Full recovery | ❌ |
| Gemini CLI | File/Memory | ⚠️ Partial | ❌ |
| AutoGen | `save_state/load_state` | ✅ Full recovery | ❌ |
| MetaGPT | SerializationMixin | ✅ Full recovery | ❌ |
| **LangGraph** | **Checkpointer** | **✅ Full recovery** | **✅** |
| CrewAI | Memory | ❌ | ❌ |

### 3.3 Multi-Agent Collaboration Patterns

| Framework | Collaboration Topology | Communication Method | Delegation Mechanism |
|-----------|----------------------|---------------------|---------------------|
| OpenCode | Single + Sub-Agent | Function return | **AgentTool** |
| Gemini CLI | Single | - | ❌ |
| AutoGen | Multi-Actor Network | **Pub/Sub Messages** | send_message |
| MetaGPT | Team + Environment | Environment.publish | Role routing |
| LangGraph | Graph Nodes | Channel | Subgraphs |
| CrewAI | **Hierarchical/Sequential** | Task context | manager_agent |

---

## 4. Source Code Pattern Extraction

### Pattern 1: Agent-as-Tool (OpenCode)

```go
// agent-tool.go - Wrap Agent as a Tool
type agentTool struct {
    sessions   session.Service
    messages   message.Service
}

func (b *agentTool) Run(ctx context.Context, call tools.ToolCall) (tools.ToolResponse, error) {
    // 1. Create child agent
    agent, _ := NewAgent(config.AgentTask, b.sessions, b.messages, TaskAgentTools(...))
    
    // 2. Create isolated session
    session, _ := b.sessions.CreateTaskSession(ctx, call.ID, sessionID, "New Agent Session")
    
    // 3. Run and await result
    done, _ := agent.Run(ctx, session.ID, params.Prompt)
    result := <-done
    
    // 4. Cost aggregation
    parentSession.Cost += updatedSession.Cost
    
    return tools.NewTextResponse(result.Message.Content().String()), nil
}
```

**Keep-Up Implementation**:
```typescript
// packages/agent-runtime/src/tools/built-in/delegateToAgent.ts
export const delegateToAgentTool = defineTool({
    name: "delegate_task",
    description: "Delegate a complex sub-task to a specialized agent",
    inputSchema: z.object({
        agentType: z.enum(["researcher", "coder", "reviewer"]),
        task: z.string(),
        context: z.record(z.any()).optional(),
    }),
    execute: async ({ agentType, task, context }, ctx) => {
        const subAgent = await ctx.agentManager.spawn({
            type: agentType,
            task,
            parentContextId: ctx.sessionId,
            signal: ctx.signal,
        });
        
        // Aggregate cost to parent
        ctx.usageTracker.addChildCost(subAgent.usage);
        
        return subAgent.output;
    },
});
```

### Pattern 2: Graceful Recovery (Gemini CLI)

```typescript
// local-executor.ts - Graceful Recovery Mechanism
async run(inputs: AgentInputs, signal: AbortSignal): Promise<OutputObject> {
    while (true) {
        const reason = this.checkTermination(startTime, turnCounter);
        if (reason) {
            terminateReason = reason;
            break;
        }
        // ... execute turn
    }
    
    // === UNIFIED RECOVERY BLOCK ===
    if (terminateReason !== AgentTerminateMode.GOAL && 
        terminateReason !== AgentTerminateMode.ABORTED) {
        
        const recoveryResult = await this.executeFinalWarningTurn(
            chat, turnCounter, terminateReason, signal
        );
        
        if (recoveryResult !== null) {
            terminateReason = AgentTerminateMode.GOAL;
            finalResult = recoveryResult;
        }
    }
}
```

**Keep-Up Implementation**:
```typescript
// packages/agent-runtime/src/orchestrator/gracefulRecovery.ts
export class GracefulRecoveryEngine {
    private readonly config: GracefulRecoveryConfig;
    
    async attemptRecovery(
        orchestrator: AgentOrchestrator,
        reason: TerminateReason
    ): Promise<RecoveryResult> {
        const warningMessage = this.buildRecoveryWarning(reason);
        
        // Inject system warning
        orchestrator.injectSystemMessage(warningMessage);
        
        for (let i = 0; i < this.config.graceTurns; i++) {
            const outcome = await orchestrator.executeSingleTurn();
            if (outcome.type === "complete") {
                return { success: true, output: outcome.response };
            }
        }
        
        return { success: false, output: null };
    }
    
    private buildRecoveryWarning(reason: TerminateReason): string {
        return `⚠️ CRITICAL: You are about to run out of turns due to: ${reason}
        
You have ${this.config.graceTurns} turns remaining. You MUST:
1. Stop any ongoing research or exploration
2. Summarize your current findings
3. Return a final response with what you have learned

If you have modified any files, ensure changes are saved.`;
    }
}
```

### Pattern 3: State Checkpointing (LangGraph)

```python
# pregel/main.py - Checkpoint System
def _prepare_state_snapshot(self, config, saved, ...):
    # Restore channel state from checkpoint
    channels, managed = channels_from_checkpoint(
        self.channels, saved.checkpoint
    )
    
    # Prepare next batch of tasks
    next_tasks = prepare_next_tasks(
        saved.checkpoint,
        saved.pending_writes,
        self.nodes,
        channels,
        ...
    )
    
    return StateSnapshot(
        values=read_channels(channels, self.stream_channels_asis),
        next=tuple(t.name for t in next_tasks.values()),
        config=patch_checkpoint_map(saved.config, saved.metadata),
        created_at=saved.checkpoint["ts"],
        tasks=tasks_with_writes,
    )
```

**Keep-Up Implementation**:
```typescript
// packages/agent-runtime/src/checkpoint/checkpointer.ts
export interface Checkpoint {
    id: string;
    threadId: string;
    step: number;
    timestamp: Date;
    state: AgentState;
    pendingWrites: PendingWrite[];
    channelVersions: Record<string, number>;
}

export interface ICheckpointer {
    save(threadId: string, state: AgentState): Promise<string>;
    load(threadId: string, checkpointId?: string): Promise<Checkpoint | null>;
    list(threadId: string): Promise<Checkpoint[]>;
    delete(threadId: string, before?: Date): Promise<void>;
}

export class SQLiteCheckpointer implements ICheckpointer {
    async save(checkpoint: Checkpoint): Promise<void> {
        await this.db.run(`
            INSERT INTO checkpoints (id, thread_id, step, state, pending_writes, ts)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            checkpoint.id,
            checkpoint.threadId,
            checkpoint.step,
            JSON.stringify(checkpoint.state),
            JSON.stringify(checkpoint.pendingWrites),
            checkpoint.timestamp.toISOString(),
        ]);
    }
    
    async getLatest(threadId: string): Promise<Checkpoint | null> {
        return this.db.get(`
            SELECT * FROM checkpoints 
            WHERE thread_id = ?
            ORDER BY step DESC LIMIT 1
        `, [threadId]);
    }
}
```

### Pattern 4: Role-Based SOPs (MetaGPT)

```python
# role.py - Role Specialization
class Role(BaseModel):
    name: str = ""
    profile: str = ""  # "Software Architect"
    goal: str = ""     # "Design scalable systems"
    constraints: str = ""  # "Follow SOLID principles"
    actions: list[Action] = []
    rc: RoleContext = Field(default_factory=RoleContext)
    
    def _get_prefix(self):
        """Build role-specific System Prompt"""
        prefix = f"You are a {self.profile}, named {self.name}, your goal is {self.goal}."
        if self.constraints:
            prefix += f" The constraint is {self.constraints}."
        return prefix
```

**Keep-Up Implementation**:
```typescript
// packages/agent-runtime/src/roles/roleDefinition.ts
export interface RoleDefinition {
    name: string;
    profile: string;
    goal: string;
    constraints: string[];
    allowedTools: string[];
    reactMode: "react" | "by_order" | "plan_and_act";
    maxReactLoop: number;
    sop?: StandardOperatingProcedure;
}

export const CODER_ROLE: RoleDefinition = {
    name: "Coder",
    profile: "Senior Software Engineer",
    goal: "Write clean, tested, and maintainable code",
    constraints: [
        "Always write tests for new code",
        "Follow existing code style",
        "Document public APIs",
    ],
    allowedTools: ["read_file", "write_file", "run_tests", "search_code"],
    reactMode: "plan_and_act",
    maxReactLoop: 10,
};
```

---

## 5. Comparative Matrix

| Feature | Keep-Up (Current) | OpenCode | Gemini CLI | AutoGen | MetaGPT | LangGraph | CrewAI |
|---------|------------------|----------|------------|---------|---------|-----------|--------|
| **Runtime Model** | While Loop | Event Loop | While Loop | **Actor** | While Loop | **DAG** | Sequential |
| **Recursive Delegation** | ❌ | **✅** | ❌ | ✅ | ❌ | ✅ | **✅** |
| **Graceful Recovery** | ❌ | ⚠️ | **✅** | ⚠️ | ⚠️ | ⚠️ | ❌ |
| **State Persistence** | Memory | Session DB | File | Interface | Serialization | **Checkpoint** | Memory |
| **Time Travel** | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** | ❌ |
| **Role SOPs** | Prompt | N/A | Prompt | System Msg | **Class** | Nodes | **YAML** |
| **Multi-Agent** | SwarmOrchestrator | AgentTool | ❌ | **Pub/Sub** | **Environment** | Subgraphs | Hierarchical |
| **Streaming** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| **Cost Tracking** | ✅ | **✅ (Aggregated)** | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ |

---

## 6. Keep-Up Gap Analysis

### 6.1 Critical Missing Capabilities

| Priority | Capability | Current State | Reference Implementation | Impact |
|----------|------------|---------------|-------------------------|--------|
| **P0** | Graceful Recovery | ❌ Silent failure | Gemini CLI | User confusion |
| **P0** | Recursive Delegation | ❌ None | OpenCode | Complex tasks limited |
| **P1** | State Checkpointing | ⚠️ Memory only | LangGraph | Cannot recover |
| **P1** | Role SOPs | ⚠️ Prompt only | MetaGPT | Inconsistent behavior |
| **P2** | Time Travel Debugging | ❌ None | LangGraph | Difficult debugging |

### 6.2 Existing Strengths

1. **Unified Tool Registry**: `IToolRegistry` design is solid
2. **Event Bus**: `RuntimeEventBus` provides observability
3. **Swarm Orchestrator**: Provides concurrent worker foundation
4. **Turn Executor**: Decoupled LLM call logic

---

## 7. Unified Architecture Design

### 7.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    AgentRuntime Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Orchestrator │──│  Checkpointer │──│  GracefulRecovery   │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘  │
│         │                                                       │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AgentManager │──│ RoleRegistry │──│   SOPExecutor        │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘  │
│         │                                                       │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ DelegateAgent│──│  ToolRegistry │──│   ContextManager    │  │
│  │    Tool      │  └──────────────┘  └──────────────────────┘  │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Core Components

| Component | Purpose | Reference Framework |
|-----------|---------|---------------------|
| `GracefulRecoveryEngine` | Never fail silently | Gemini CLI |
| `DelegateAgentTool` | Recursive delegation | OpenCode |
| `Checkpointer` | State persistence & recovery | LangGraph |
| `RoleRegistry` | Role-based agent configuration | MetaGPT |
| `SOPExecutor` | Standardized operating procedures | MetaGPT |

---

## 8. Implementation Roadmap

### Phase 1: Robust Foundation (Week 1-2)
**Goal**: Solve P0 issues - Graceful Recovery + Recursive Delegation

| Task | File | Estimate |
|------|------|----------|
| Implement GracefulRecoveryEngine | `orchestrator/gracefulRecovery.ts` | 4h |
| Integrate into Orchestrator | `orchestrator/orchestrator.ts` | 2h |
| Implement DelegateAgentTool | `tools/built-in/delegateToAgent.ts` | 4h |
| Update AgentManager for parent-child | `agents/manager.ts` | 2h |
| Unit tests | `__tests__/` | 4h |

### Phase 2: State Persistence (Week 3-4)
**Goal**: Solve P1 issues - Checkpointer

| Task | File | Estimate |
|------|------|----------|
| Define Checkpointer interface | `checkpoint/types.ts` | 2h |
| Implement SQLiteCheckpointer | `checkpoint/sqliteCheckpointer.ts` | 6h |
| Integrate into Orchestrator | `orchestrator/orchestrator.ts` | 4h |
| Implement recovery logic | `orchestrator/sessionRecovery.ts` | 4h |
| Integration tests | `__tests__/integration/` | 4h |

### Phase 3: Role SOPs (Week 5-6)
**Goal**: Solve P1 issues - Role Specialization

| Task | File | Estimate |
|------|------|----------|
| Define RoleDefinition | `roles/roleDefinition.ts` | 2h |
| Implement RoleRegistry | `roles/roleRegistry.ts` | 4h |
| Implement SOPExecutor | `roles/sopExecutor.ts` | 6h |
| Preset role configurations | `roles/presets/` | 4h |
| Update AgentManager | `agents/manager.ts` | 2h |

### Phase 4: Advanced Features (Week 7-8)
**Goal**: Solve P2 issues - Time Travel Debugging

| Task | File | Estimate |
|------|------|----------|
| Implement Checkpoint History API | `checkpoint/history.ts` | 4h |
| Implement State Replay | `debug/stateReplay.ts` | 6h |
| Develop Debug UI Components | UI layer | 8h |

---

## Appendix A: Source Code References

All analyzed source code is located at: `.tmp/analysis/`

- `opencode/internal/llm/agent/agent.go` - Main agent loop
- `opencode/internal/llm/agent/agent-tool.go` - Agent-as-Tool implementation
- `gemini-cli/packages/core/src/agents/local-executor.ts` - Graceful recovery
- `autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py` - Actor runtime
- `MetaGPT/metagpt/roles/role.py` - Role definition
- `langgraph/libs/langgraph/langgraph/pregel/main.py` - Graph execution engine
- `crewAI/lib/crewai/src/crewai/crew.py` - Crew orchestration

---

**Document End**
