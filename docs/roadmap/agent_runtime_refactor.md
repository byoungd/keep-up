# Roadmap: Agent Runtime Refactor & Optimization

## Phase 1: Architecture Alignment (Current)
Align our local `agent-runtime` with best practices from high-performance agent loops (OpenCode) and modular delegation patterns (Gemini CLI).

### Key Milestones
- [x] **Architecture Research**: Analyze OpenCode (Go) and Gemini CLI (Typescript) architectures.
- [x] **Implementation Plan**: Define the refactor of `AgentOrchestrator` to use the `AgentLoopStateMachine`.
- [/] **State Machine Integration**: Refactor `AgentOrchestrator` to utilize `AgentLoopStateMachine` for explicit phase management.
    - [ ] Instantiate state machine within Orchestrator.
    - [ ] Map internal state status (`thinking`, `executing`) to machine phases.
    - [ ] Refactor `executeTurn` to be phase-driven.

## Phase 2: Delegation & Swarm Support
Enable the orchestrator to break down complex tasks and delegate them to specialized sub-agents.

### Key Milestones
- [ ] **Sub-agent Orchestrator**: Implement the `SubagentOrchestrator` to handle recursive task delegation.
- [ ] **Specialist Agent Profiles**: Define specialized profiles for code editing, research, and verification.
- [ ] **Context Handoff**: Implement clean context and memory sharing between parent and sub-agents.

## Phase 3: Performance & Reliability
Focus on reducing latency and improving the robustness of the agentic loop.

### Key Milestones
- [ ] **Streaming Optimization**: Real-time event streaming for better user feedback (OpenCode pattern).
- [ ] **Token Usage Optimization**: Advanced message compression and pruning strategies.
- [ ] **Error Recovery Engine**: Dynamic retry and self-correction loops for tool execution failures.

## Long-term Vision
Develop a highly autonomous, efficient, and modular agent runtime that can handle complex software engineering tasks with minimal human intervention.
