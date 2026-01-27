# Open Wrap

> **Next-Gen Agentic Coding Workspace**

A professional coding environment enabling autonomous AI agents to **Plan**, **Build**, and **Verify** software.

## Key Capabilities

- **Multi-Agent Orchestration**: Powered by OpenAI Agents SDK.
- **Agentic Runtime**:
  - **Browser Agent**: Headless frontend control.
  - **Git Isolation**: Safe execution in parallel worktrees.
  - **Pipelines**: Long-running background task delegation.
- **Provider Agnostic**: Connect any LLM via Vercel AI SDK.

## Packages

- **@ku0/agent-runtime**: Core agent infrastructure and MCP tools.
- **@ku0/ai-core**: Standardized AI adapters and structured outputs.
- **@ku0/cowork**: The main application server and UI.

## Getting Started

```bash
pnpm install
pnpm dev
```

## Comparisons

An analysis of related projects in the `.tmp` directory highlights Open Wrap's unique position as a comprehensive workspace rather than just a tool or framework.

| Feature | **Open Wrap** | **Cline** | **AutoGPT** | **Open Interpreter** | **LangGraph** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Core Concept** | **Agentic Workspace** | IDE Extension | Autonomous Platform | Local Interpreter | Agent Framework |
| **Interface** | **TUI + Web GUI** | VS Code Sidebar | Web Dashboard / CLI | Terminal / Python | SDK / Library |
| **Isolation** | **Git Worktrees + Sandbox** | Local Environment | Docker Containers | Local System | Implementation Dependent |
| **Orchestration** | **Multi-Agent Pipelines** | Single Task Loop | Continuous Loops | Conversational | State Graph |
| **Target User** | Professional Developers | VS Code Users | Automation Enthusiasts | Power Users / Data Scientists | AI Engineers |

### Key Differentiators

- **Hybrid Interface**: Unlike CLI-only tools or pure IDE extensions, Open Wrap provides a dedicated **TUI for speed** and a **Web GUI for rich visualization**, bridged by a unified state.
- **Safety First**: Execution happens in **isolated git worktrees**, preventing agents from messing up your main working directory or staging area—a critical feature for professional maintenance.
- **Provider Agnostic**: Built on the Vercel AI SDK, allowing hot-swapping of models (OpenAI, Anthropic, etc.) without vendor lock-in, similar to **Open Interpreter** but with structured workspace management.

### 🔍 Feature Deep Dive

#### 🧠 Context & State Management

| Project | Context Handling | State Persistence | Recovery |
| :--- | :--- | :--- | :--- |
| **Open Wrap** | **Sessions & Git Worktrees** | **Database (SQLite/JSON)** | **Full Checkpoint Resume** |
| **Cline** | VS Code Editor Context | JSON Files | Manual History |
| **AutoGPT** | Vector Embeddings | File-based / Redis | Continuous Loop Resume |
| **LangGraph** | Graph State Schema | Checkpointers (Postgres) | Step-by-step Retry |

#### 🔌 Extensibility & Runtime

| Project | Protocol Support | Runtime Environment | Tools |
| :--- | :--- | :--- | :--- |
| **Open Wrap** | **MCP (Server & Client)** | **Node.js / Sandboxed** | **Agentic Tools + MCP** |
| **Cline** | MCP (Client Only) | VS Code Host | IDE + Browser |
| **Open Interpreter** | Python Interface | Local OS Shell | System Commands |
| **AutoGPT** | Custom Plugins | Docker | Built-in Commands |
