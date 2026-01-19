import { SandboxToolServer } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import type {
  SandboxContext,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxInfo,
  SandboxManager,
  SandboxPolicy,
} from "../sandbox";
import type { ToolContext } from "../types";

class MockSandboxContext implements SandboxContext {
  readonly id: string;
  readonly containerId: string;
  readonly image: string;
  readonly workspacePath: string;
  readonly containerWorkspacePath: string;
  readonly policy: SandboxPolicy;
  readonly createdAt: number;
  lastUsedAt: number;

  constructor(id: string) {
    this.id = id;
    this.containerId = `container-${id}`;
    this.image = "node:20-alpine";
    this.workspacePath = "/workspace";
    this.containerWorkspacePath = "/workspace";
    this.policy = {
      network: "none",
      filesystem: "workspace-only",
      maxMemoryMB: 256,
      maxCpuPercent: 50,
      timeoutMs: 10_000,
    };
    this.createdAt = Date.now();
    this.lastUsedAt = this.createdAt;
  }

  async exec(command: string, _options?: SandboxExecOptions): Promise<SandboxExecResult> {
    this.lastUsedAt = Date.now();
    return {
      exitCode: 0,
      stdout: `ran: ${command}`,
      stderr: "",
      durationMs: 5,
      timedOut: false,
      truncated: false,
    };
  }

  info(): SandboxInfo {
    return {
      id: this.id,
      containerId: this.containerId,
      image: this.image,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      workspacePath: this.workspacePath,
      containerWorkspacePath: this.containerWorkspacePath,
      policy: this.policy,
    };
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

class MockSandboxManager implements SandboxManager {
  private readonly sandboxes = new Map<string, SandboxContext>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getSandbox(id: string): Promise<SandboxContext> {
    const existing = this.sandboxes.get(id);
    if (existing) {
      return existing;
    }
    const created = new MockSandboxContext(id);
    this.sandboxes.set(id, created);
    return created;
  }

  async createSandbox(id: string): Promise<SandboxContext> {
    const sandbox = new MockSandboxContext(id);
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  async closeSandbox(id: string): Promise<void> {
    this.sandboxes.delete(id);
  }

  listSandboxes(): SandboxInfo[] {
    return Array.from(this.sandboxes.values()).map((sandbox) => sandbox.info());
  }

  getSandboxInfo(id: string): SandboxInfo | null {
    const sandbox = this.sandboxes.get(id);
    return sandbox ? sandbox.info() : null;
  }

  async dispose(): Promise<void> {
    this.sandboxes.clear();
  }
}

function createContext(sessionId = "session-1"): ToolContext {
  return {
    sessionId,
    security: {
      sandbox: {
        type: "process",
        networkAccess: "none",
        fsIsolation: "workspace",
      },
      permissions: {
        bash: "sandbox",
        file: "workspace",
        code: "sandbox",
        network: "none",
        lfcc: "read",
      },
      limits: {
        maxExecutionTimeMs: 30_000,
        maxMemoryBytes: 256 * 1024 * 1024,
        maxOutputBytes: 1024 * 1024,
        maxConcurrentCalls: 3,
      },
    },
  };
}

describe("SandboxToolServer", () => {
  it("creates, executes, and destroys sandboxes", async () => {
    const server = new SandboxToolServer({ manager: new MockSandboxManager() });
    const context = createContext();

    const createResult = await server.callTool(
      { name: "create", arguments: { sessionId: "session-1" } },
      context
    );
    expect(createResult.success).toBe(true);

    const execResult = await server.callTool(
      { name: "exec", arguments: { sessionId: "session-1", command: "echo test" } },
      context
    );
    expect(execResult.success).toBe(true);
    expect(execResult.content[0]?.type).toBe("text");
    expect(execResult.content[0]?.text).toContain("ran: echo test");

    const infoResult = await server.callTool(
      { name: "info", arguments: { sessionId: "session-1" } },
      context
    );
    expect(infoResult.success).toBe(true);

    const listResult = await server.callTool({ name: "list", arguments: {} }, context);
    expect(listResult.success).toBe(true);

    const destroyResult = await server.callTool(
      { name: "destroy", arguments: { sessionId: "session-1" } },
      context
    );
    expect(destroyResult.success).toBe(true);
  });
});
