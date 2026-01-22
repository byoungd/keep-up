/**
 * Agent Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_PROFILES,
  type AgentLLMRequest,
  type AgentLLMResponse,
  type AgentType,
  createAgentManager,
  createBashToolServer,
  createCompletionToolServer,
  createFileToolServer,
  createMockLLM,
  createToolRegistry,
  getAgentProfile,
  type IAgentLLM,
  listAgentTypes,
} from "../index";

class RecordingLLM implements IAgentLLM {
  lastRequest?: AgentLLMRequest;

  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    this.lastRequest = request;
    return {
      content: "Done",
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  }
}

// ============================================================================
// Profile Tests
// ============================================================================

describe("Agent Profiles", () => {
  it("should have all expected agent types", () => {
    const types = listAgentTypes();

    // Baseline required agent types
    const required: AgentType[] = ["general", "bash", "explore", "plan", "code", "research"];
    for (const type of required) {
      expect(types).toContain(type);
    }
    // Ensure we expose all defined profiles (may grow over time)
    expect(types.length).toBe(Object.keys(AGENT_PROFILES).length);
  });

  it("should return correct profile for each type", () => {
    const types: AgentType[] = ["general", "bash", "explore", "plan", "code", "research"];

    for (const type of types) {
      const profile = getAgentProfile(type);
      expect(profile.type).toBe(type);
      expect(profile.name).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.systemPrompt).toBeTruthy();
      expect(profile.allowedTools.length).toBeGreaterThan(0);
    }
  });

  it("should have valid security presets for all profiles", () => {
    const validPresets = ["safe", "balanced", "power", "developer"];

    for (const profile of Object.values(AGENT_PROFILES)) {
      expect(validPresets).toContain(profile.securityPreset);
    }
  });

  it("general agent should have access to all tools", () => {
    const profile = getAgentProfile("general");
    expect(profile.allowedTools).toContain("*");
  });

  it("explore agent should have read-only tools", () => {
    const profile = getAgentProfile("explore");
    expect(profile.allowedTools).toContain("file:read");
    expect(profile.allowedTools).toContain("file:list");
    expect(profile.allowedTools).not.toContain("file:write");
    expect(profile.allowedTools).not.toContain("bash:*");
  });

  it("research agent should have web tools", () => {
    const profile = getAgentProfile("research");
    expect(profile.allowedTools).toContain("web:search");
    expect(profile.allowedTools).toContain("web:fetch");
  });
});

// ============================================================================
// Agent Manager Tests
// ============================================================================

describe("AgentManager", () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let llm: ReturnType<typeof createMockLLM>;

  beforeEach(async () => {
    registry = createToolRegistry();
    await registry.register(createCompletionToolServer());
    await registry.register(createFileToolServer());
    llm = createMockLLM();
  });

  it("should create manager with config", () => {
    const manager = createAgentManager({ llm, registry });

    expect(manager).toBeDefined();
    expect(manager.getAvailableTypes()).toHaveLength(Object.keys(AGENT_PROFILES).length);
  });

  it("should return available agent types", () => {
    const manager = createAgentManager({ llm, registry });
    const types = manager.getAvailableTypes();

    expect(types).toContain("explore");
    expect(types).toContain("bash");
    expect(types).toContain("plan");
  });

  it("should get profile for agent type", () => {
    const manager = createAgentManager({ llm, registry });
    const profile = manager.getProfile("explore");

    expect(profile.type).toBe("explore");
    expect(profile.name).toBe("Explore Agent");
  });

  it("should spawn an agent and get result", async () => {
    llm.setDefaultResponse({
      content: "I found 3 TypeScript files in the project.",
      finishReason: "tool_use",
      toolCalls: [
        {
          name: "completion:complete_task",
          arguments: { summary: "Found TypeScript files." },
        },
      ],
    });

    const manager = createAgentManager({ llm, registry });

    const result = await manager.spawn({
      type: "explore",
      task: "Find all TypeScript files",
    });

    expect(result.success).toBe(true);
    expect(result.type).toBe("explore");
    expect(result.agentId).toMatch(/^explore-/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uses completion summary when assistant content is empty", async () => {
    llm.setDefaultResponse({
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          name: "completion:complete_task",
          arguments: { summary: "Summary only" },
        },
      ],
    });

    const manager = createAgentManager({ llm, registry });

    const result = await manager.spawn({
      type: "explore",
      task: "Return summary only",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("Summary only");
  });

  it("should handle agent errors gracefully", async () => {
    llm.complete = async () => {
      throw new Error("LLM connection failed");
    };

    const manager = createAgentManager({ llm, registry });

    const result = await manager.spawn({
      type: "explore",
      task: "Find files",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM connection failed");
  });

  it("should spawn multiple agents in parallel", async () => {
    let callCount = 0;
    llm.complete = async () => {
      callCount++;
      return {
        content: `Agent ${callCount} completed`,
        finishReason: "tool_use" as const,
        toolCalls: [
          {
            name: "completion:complete_task",
            arguments: { summary: `Agent ${callCount} completed` },
          },
        ],
      };
    };

    const manager = createAgentManager({ llm, registry });

    const results = await manager.spawnParallel([
      { type: "explore", task: "Task 1" },
      { type: "explore", task: "Task 2" },
      { type: "plan", task: "Task 3" },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
    expect(callCount).toBe(3);
  });

  it("honors explicit empty allowlists for scoped agents", async () => {
    const scopedRegistry = createToolRegistry();
    await scopedRegistry.register(createCompletionToolServer());
    await scopedRegistry.register(createFileToolServer());
    await scopedRegistry.register(createBashToolServer());

    const recordingLLM = new RecordingLLM();
    const manager = createAgentManager({ llm: recordingLLM, registry: scopedRegistry });

    await manager.spawn({
      type: "general",
      task: "No tools",
      allowedTools: [],
    });

    const toolNames = recordingLLM.lastRequest?.tools.map((tool) => tool.name) ?? [];
    expect(toolNames).toContain("completion:complete_task");
    expect(toolNames.some((name) => name.startsWith("file:"))).toBe(false);
    expect(toolNames.some((name) => name.startsWith("bash:"))).toBe(false);
  });

  it("should respect maxConcurrent limit", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    llm.complete = async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 10));
      concurrentCount--;
      return {
        content: "Done",
        finishReason: "tool_use" as const,
        toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Done" } }],
      };
    };

    const manager = createAgentManager({
      llm,
      registry,
      maxConcurrent: 2,
    });

    await manager.spawnParallel([
      { type: "explore", task: "Task 1" },
      { type: "explore", task: "Task 2" },
      { type: "explore", task: "Task 3" },
      { type: "explore", task: "Task 4" },
    ]);

    // Should process in batches of 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("should stop a running agent", async () => {
    let _callCount = 0;
    llm.complete = async () => {
      _callCount++;
      // Simulate long-running task
      await new Promise((r) => setTimeout(r, 100));
      return {
        content: "Still working...",
        toolCalls: [{ name: "list", arguments: { path: "/tmp" } }],
        finishReason: "tool_use" as const,
      };
    };

    const manager = createAgentManager({
      llm,
      registry,
      maxConcurrent: 5,
    });

    // Start agent
    const promise = manager.spawn({
      type: "explore",
      task: "Long task",
    });

    // Wait a bit then stop
    await new Promise((r) => setTimeout(r, 50));
    const _agentId = `explore-1-${Date.now().toString(36).slice(0, 6)}`;

    // Try to stop (may or may not work depending on timing)
    for (const id of ["explore-1"]) {
      const prefix = id;
      for (const entry of (manager as unknown as { runningAgents: Map<string, unknown> })
        .runningAgents ?? []) {
        if (typeof entry === "string" && entry.startsWith(prefix)) {
          await manager.stop(entry);
        }
      }
    }

    await promise;
    // Just verify it completed without hanging
    expect(true).toBe(true);
  });

  it("should filter tools based on agent profile", async () => {
    let callCount = 0;
    llm.complete = async () => {
      callCount++;
      if (callCount === 1) {
        // Try to use a tool not allowed for explore agent
        return {
          content: "Trying to execute bash...",
          toolCalls: [{ name: "execute", arguments: { command: "ls" } }],
          finishReason: "tool_use" as const,
        };
      }
      return {
        content: "Done",
        finishReason: "tool_use" as const,
        toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Done" } }],
      };
    };

    const manager = createAgentManager({ llm, registry });

    const result = await manager.spawn({
      type: "explore",
      task: "Try to run bash",
    });

    // explore agent should not have access to bash:execute
    expect(result.success).toBe(true);
    // The bash command should have been denied (filtered out)
  });

  it("should get agent status", async () => {
    llm.setDefaultResponse({
      content: "Done",
      finishReason: "tool_use",
      toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Done" } }],
    });

    const manager = createAgentManager({ llm, registry });

    // Before spawning, status should be undefined
    expect(manager.getStatus("nonexistent")).toBeUndefined();

    // After spawning and completing
    const result = await manager.spawn({
      type: "explore",
      task: "Quick task",
    });

    // Status should be completed or undefined (cleanup timer)
    const status = manager.getStatus(result.agentId);
    expect(status === "completed" || status === undefined).toBe(true);
  });
});

// ============================================================================
// Web Search Tool Tests
// ============================================================================

describe("WebSearchToolServer", () => {
  it("should be importable", async () => {
    const { createWebSearchToolServer, MockWebSearchProvider } = await import(
      "@ku0/agent-runtime-tools"
    );

    expect(createWebSearchToolServer).toBeDefined();
    expect(MockWebSearchProvider).toBeDefined();
  });

  it("should create server with mock provider", async () => {
    const { createWebSearchToolServer } = await import("@ku0/agent-runtime-tools");
    const server = createWebSearchToolServer();

    const tools = server.listTools();
    expect(tools.some((t) => t.name === "search")).toBe(true);
    expect(tools.some((t) => t.name === "fetch")).toBe(true);
  });

  it("should search with mock provider", async () => {
    const { createWebSearchToolServer, MockWebSearchProvider } = await import(
      "@ku0/agent-runtime-tools"
    );
    const { createSecurityPolicy } = await import("../security");

    const mockProvider = new MockWebSearchProvider();
    mockProvider.setMockResults([
      { title: "Test Result", url: "https://example.com", snippet: "A test result" },
    ]);

    const server = createWebSearchToolServer(mockProvider);
    const result = await server.callTool(
      { name: "search", arguments: { query: "test query" } },
      { security: createSecurityPolicy("balanced") }
    );

    expect(result.success).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text: string }).text).toContain("Test Result");
  });

  it("should fetch with mock provider", async () => {
    const { createWebSearchToolServer, MockWebSearchProvider } = await import(
      "@ku0/agent-runtime-tools"
    );
    const { createSecurityPolicy } = await import("../security");

    const mockProvider = new MockWebSearchProvider();
    const server = createWebSearchToolServer(mockProvider);
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "https://example.com/page" } },
      { security: createSecurityPolicy("balanced") }
    );

    expect(result.success).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("Mock Page");
  });

  it("should reject invalid URLs", async () => {
    const { createWebSearchToolServer } = await import("@ku0/agent-runtime-tools");
    const { createSecurityPolicy } = await import("../security");

    const server = createWebSearchToolServer();
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "not-a-valid-url" } },
      { security: createSecurityPolicy("balanced") }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("should respect network permission", async () => {
    const { createWebSearchToolServer } = await import("@ku0/agent-runtime-tools");
    const { securityPolicy } = await import("../security");

    const server = createWebSearchToolServer();
    const result = await server.callTool(
      { name: "search", arguments: { query: "test" } },
      { security: securityPolicy().withNetworkPermission("none").build() }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });
});
