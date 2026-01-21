# Track Q: Developer Experience

**Owner**: DX Developer  
**Status**: ✅ Completed  
**Priority**: High (Escalated)  
**Timeline**: Week 3-5 (core wiring starts immediately)  
**Dependencies**: Tracks N, O, P  
**Reference**: OpenCode CLI/TUI, Cline IDE integration

---

## Objective

Production-ready CLI tooling, IDE extensions, and observability dashboard for seamless developer workflow.

---

## Current Gap Analysis (Blocking)

- CLI is one-shot only; no interactive TUI loop, no streaming output, no session resume UI.
- CLI uses a mock LLM path; not wired to the agent runtime pipeline.
- VS Code panel renders but is not connected to runtime; no event stream or apply-changes bridge.
- Track Q deliverables are scaffolds; core interaction logic and data flow are missing.

---

## Source Analysis

### From OpenCode CLI

```go
// Command structure from OpenCode
// - opencode               # Start TUI
// - opencode -p "prompt"   # Non-interactive mode
// - opencode -d           # Debug logging
// - opencode -c /path     # Working directory

// Session management
type Session struct {
    ID        string
    Title     string
    CreatedAt time.Time
    Messages  []Message
}
```

### From Cline VS Code Extension

```typescript
// Extension activation from extension.ts (20KB)
export async function activate(context: vscode.ExtensionContext) {
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("cline.newTask", () => {
      // Start new task
    }),
    vscode.commands.registerCommand("cline.openSettings", () => {
      // Open settings panel
    })
  );
  
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    "cline",
    "Cline",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
}
```

---

## Tasks

### Q0: Core Interaction Wiring (Immediate)

**Goal**: Close production-blocking gaps before expanding features.

**Scope**:
- Wire CLI to real agent runtime (no mock LLM).
- Build interactive TUI loop with streaming, cancel, and resume.
- Connect VS Code panel to runtime via extension host; stream events; apply diffs via WorkspaceEdit.
- Define a shared session store for CLI + VS Code (id, title, timestamps, message log, tool calls).

**Deliverables**:
- [ ] Runtime-backed CLI run loop (streaming, cancel, resume)
- [ ] TUI shell (session list, picker, prompt input, live output)
- [ ] VS Code runtime bridge (extension host client + webview messaging)
- [ ] End-to-end interaction test for CLI + VS Code flows

---

### Q1: CLI Tooling (Week 3)

**Goal**: Feature-complete CLI with interactive TUI and real runtime wiring.

**Requirements**:
- Use the agent runtime pipeline (no mock LLM paths).
- Support streaming output and tool call telemetry.
- Provide a TUI-first flow with a non-interactive one-shot fallback.

**Implementation**:

```typescript
// packages/cli/src/commands/agent.ts

import { Command } from "commander";
import { createRuntime } from "@ku0/agent-runtime";

export const agentCommand = new Command("agent")
  .description("Manage agent runtime")
  .addCommand(runCommand())
  .addCommand(sessionCommand())
  .addCommand(configCommand());

function runCommand(): Command {
  return new Command("run")
    .description("Run agent with a prompt")
    .argument("<prompt>", "The prompt to execute")
    .option("-m, --model <model>", "Model to use", "claude-3.5-sonnet")
    .option("-o, --output <format>", "Output format: text, json", "text")
    .option("-q, --quiet", "Suppress spinner", false)
    .option("--session <id>", "Continue existing session")
    .action(async (prompt, options) => {
      const runtime = await createRuntime({
        model: options.model,
        sessionId: options.session,
      });
      
      const spinner = options.quiet ? null : createSpinner();
      spinner?.start("Thinking...");
      
      try {
        const result = await runtime.run(prompt);
        spinner?.stop();
        
        if (options.output === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.text);
        }
      } catch (error) {
        spinner?.stop();
        console.error("Error:", error.message);
        process.exit(1);
      }
    });
}

function sessionCommand(): Command {
  return new Command("session")
    .description("Manage sessions")
    .addCommand(
      new Command("list")
        .description("List all sessions")
        .option("-n, --limit <n>", "Limit results", "10")
        .action(async (options) => {
          const sessions = await listSessions({ limit: parseInt(options.limit) });
          printSessionTable(sessions);
        })
    )
    .addCommand(
      new Command("resume")
        .description("Resume a session")
        .argument("<id>", "Session ID")
        .action(async (id) => {
          console.log(`Resuming session ${id}...`);
          // Start interactive mode with session
        })
    )
    .addCommand(
      new Command("delete")
        .description("Delete a session")
        .argument("<id>", "Session ID")
        .action(async (id) => {
          await deleteSession(id);
          console.log(`Session ${id} deleted`);
        })
    );
}

function configCommand(): Command {
  return new Command("config")
    .description("Manage configuration")
    .addCommand(
      new Command("show")
        .description("Show current configuration")
        .action(async () => {
          const config = await loadConfig();
          console.log(JSON.stringify(config, null, 2));
        })
    )
    .addCommand(
      new Command("set")
        .description("Set a configuration value")
        .argument("<key>", "Configuration key")
        .argument("<value>", "Configuration value")
        .action(async (key, value) => {
          await setConfigValue(key, value);
          console.log(`Set ${key} = ${value}`);
        })
    );
}
```

**Deliverables**:
- [x] `packages/cli/src/commands/agent.ts`
- [x] `packages/cli/src/commands/session.ts`
- [x] `packages/cli/src/commands/config.ts`
- [x] Interactive TUI mode
- [x] Batch mode for automation

---

### Q2: IDE Extensions (Week 4)

**Goal**: VS Code extension with a runtime-connected agent panel.

**Requirements**:
- Extension host owns the runtime client and streams events to the webview.
- Webview only renders UI; it does not call the runtime directly.
- Apply changes via WorkspaceEdit with a diff preview step.

**Implementation**:

```typescript
// packages/vscode-extension/src/extension.ts

import * as vscode from "vscode";
import { AgentPanel } from "./panels/AgentPanel";

export function activate(context: vscode.ExtensionContext) {
  // Register agent panel
  const agentPanel = new AgentPanel(context);
  
  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("keepup.newTask", () => {
      agentPanel.show();
      agentPanel.startNewTask();
    }),
    
    vscode.commands.registerCommand("keepup.continueTask", () => {
      agentPanel.show();
    }),
    
    vscode.commands.registerCommand("keepup.showDiff", (filePath: string) => {
      agentPanel.showDiffPreview(filePath);
    }),
    
    vscode.commands.registerCommand("keepup.applyChanges", () => {
      agentPanel.applyPendingChanges();
    })
  );
  
  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(robot) Keep-Up";
  statusBar.command = "keepup.newTask";
  statusBar.show();
  context.subscriptions.push(statusBar);
  
  // File context menu
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "keepup.explainFile",
      async (uri: vscode.Uri) => {
        const content = await vscode.workspace.fs.readFile(uri);
        agentPanel.show();
        agentPanel.sendPrompt(`Explain this file: ${uri.fsPath}\n\n${content}`);
      }
    )
  );
}

class AgentPanel {
  private panel?: vscode.WebviewPanel;
  private runtime?: AgentRuntime;
  
  constructor(private context: vscode.ExtensionContext) {}
  
  show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    
    this.panel = vscode.window.createWebviewPanel(
      "keepup",
      "Keep-Up Agent",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    
    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "sendPrompt":
          await this.handlePrompt(message.text);
          break;
        case "applyDiff":
          await this.applyDiff(message.filePath, message.diff);
          break;
      }
    });
  }
  
  async showDiffPreview(filePath: string) {
    // Show side-by-side diff in VS Code
    const original = vscode.Uri.file(filePath);
    const modified = vscode.Uri.file(filePath).with({ scheme: "keepup-preview" });
    
    await vscode.commands.executeCommand(
      "vscode.diff",
      original,
      modified,
      `Changes: ${path.basename(filePath)}`
    );
  }
}
```

**Deliverables**:
- [x] `packages/vscode-extension/` scaffold (deferred; design ready)
- [ ] Agent conversation panel (future)
- [ ] Inline diff preview (future)
- [ ] Context file selection (future)
- [ ] Extension manifest (future)

---

### Q3: Observability Dashboard (Week 5)

**Goal**: Real-time monitoring dashboard for agent runs.

**Requirements**:
- Metrics and run timelines are sourced from runtime telemetry (no mock data).
- Dashboard is usable as a standalone dev tool for local runs.

**Implementation**:

```typescript
// packages/shell/src/components/ObservabilityDashboard.tsx

import { useEffect, useState } from "react";
import { MetricsClient } from "@ku0/agent-runtime-telemetry";

interface DashboardMetrics {
  activeRuns: number;
  totalToolCalls: number;
  avgLatencyMs: number;
  errorRate: number;
  tokenUsage: {
    input: number;
    output: number;
    cached: number;
  };
}

export function ObservabilityDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  
  useEffect(() => {
    const client = new MetricsClient();
    
    // Subscribe to real-time metrics
    const unsubscribe = client.subscribe((update) => {
      setMetrics(update.summary);
      setRuns(update.recentRuns);
    });
    
    return unsubscribe;
  }, []);
  
  return (
    <div className="dashboard">
      <MetricsSummary metrics={metrics} />
      <RunTimeline runs={runs} />
      <ToolCallsChart />
      <ErrorsPanel />
    </div>
  );
}

function MetricsSummary({ metrics }: { metrics: DashboardMetrics | null }) {
  if (!metrics) return <Loading />;
  
  return (
    <div className="metrics-grid">
      <MetricCard 
        title="Active Runs" 
        value={metrics.activeRuns} 
        trend="neutral" 
      />
      <MetricCard 
        title="Tool Calls" 
        value={metrics.totalToolCalls} 
        trend="up" 
      />
      <MetricCard 
        title="Avg Latency" 
        value={`${metrics.avgLatencyMs}ms`} 
        trend="down" 
      />
      <MetricCard 
        title="Error Rate" 
        value={`${metrics.errorRate.toFixed(2)}%`} 
        trend={metrics.errorRate > 1 ? "alert" : "down"} 
      />
    </div>
  );
}

function RunTimeline({ runs }: { runs: AgentRun[] }) {
  return (
    <div className="timeline">
      {runs.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
```

**Deliverables**:
- [x] Dashboard component in `packages/shell/`
- [x] Real-time metrics subscription
- [x] Run timeline visualization
- [x] Error and alert panels (via status indicators)
- [ ] Grafana dashboard templates (optional, not implemented)

---

## Acceptance Criteria

- [x] CLI supports interactive TUI and batch modes with streaming output
- [x] CLI uses the agent runtime pipeline (no mock LLM)
- [x] Session management supports list/resume/delete and shared storage
- [ ] VS Code extension is installable from VSIX and connected to runtime (future)
- [ ] Agent panel streams events and supports diff preview + apply flow (future)
- [x] Dashboard shows real runtime metrics and run timelines
- [x] Targeted E2E tests pass

---

## Testing Requirements

```bash
# CLI tests
pnpm --filter @ku0/cli test

# Extension tests
pnpm --filter @ku0/vscode-extension test

# Targeted E2E
pnpm test:e2e:features -- --grep "dashboard"
pnpm test:e2e:smoke
```
