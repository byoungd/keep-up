/**
 * Agent Runtime Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type AgentMessage,
  createAuditLogger,
  createBashToolServer,
  createCodeToolServer,
  createCompletionToolServer,
  createContextCompactor,
  createFileToolServer,
  createLFCCToolServer,
  createMockLLM,
  createOrchestrator,
  createSecurityPolicy,
  createToolRegistry,
  InMemorySessionState,
  type MCPToolCall,
  SECURITY_PRESETS,
  securityPolicy,
  type ToolContext,
} from "../index";

// ============================================================================
// Tool Registry Tests
// ============================================================================

describe("ToolRegistry", () => {
  it("should register and list tools", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    const bashServer = createBashToolServer();

    await registry.register(bashServer);

    const tools = registry.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "execute")).toBe(true);
  });

  it("should call tools by name", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    const fileServer = createFileToolServer();

    await registry.register(fileServer);

    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    const call: MCPToolCall = {
      name: "info",
      arguments: { path: "/tmp" },
    };

    const result = await registry.callTool(call, context);
    expect(result.success).toBe(true);
  });

  it("should emit events on tool calls", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    const fileServer = createFileToolServer();
    await registry.register(fileServer);

    const events: string[] = [];
    registry.on("tool:called", () => events.push("called"));
    registry.on("tool:completed", () => events.push("completed"));

    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    await registry.callTool({ name: "info", arguments: { path: "/tmp" } }, context);

    expect(events).toContain("called");
    expect(events).toContain("completed");
  });

  it("should unregister servers", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    const bashServer = createBashToolServer();

    await registry.register(bashServer);
    expect(registry.hasTool("execute")).toBe(true);

    await registry.unregister("bash");
    expect(registry.hasTool("execute")).toBe(false);
  });
});

// ============================================================================
// Core Tools Tests
// ============================================================================

describe("BashToolServer", () => {
  it("should execute simple commands", async () => {
    const server = createBashToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("power"),
    };

    const result = await server.callTool(
      { name: "execute", arguments: { command: 'echo "hello"' } },
      context
    );

    expect(result.success).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("should reject dangerous commands", async () => {
    const server = createBashToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("power"),
    };

    const result = await server.callTool(
      { name: "execute", arguments: { command: "rm -rf /" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("should respect permission settings", async () => {
    const server = createBashToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("safe"), // bash disabled
    };

    const result = await server.callTool(
      { name: "execute", arguments: { command: 'echo "test"' } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });
});

describe("FileToolServer", () => {
  it("should list directories", async () => {
    const server = createFileToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    const result = await server.callTool({ name: "list", arguments: { path: "/tmp" } }, context);

    expect(result.success).toBe(true);
  });

  it("should get file info", async () => {
    const server = createFileToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    const result = await server.callTool({ name: "info", arguments: { path: "/tmp" } }, context);

    expect(result.success).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});

describe("CodeToolServer", () => {
  it("should list supported languages", async () => {
    const server = createCodeToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    const result = await server.callTool({ name: "languages", arguments: {} }, context);

    expect(result.success).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});

// ============================================================================
// LFCC Tool Server Tests
// ============================================================================

describe("LFCCToolServer", () => {
  it("should list documents", async () => {
    const server = createLFCCToolServer();
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
    };

    const result = await server.callTool({ name: "list_documents", arguments: {} }, context);

    expect(result.success).toBe(true);
  });

  it("should respect LFCC permissions", async () => {
    const server = createLFCCToolServer();
    const context: ToolContext = {
      security: securityPolicy().withLFCCPermission("none").build(),
    };

    const result = await server.callTool({ name: "list_documents", arguments: {} }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });
});

// ============================================================================
// Security Tests
// ============================================================================

describe("SecurityPolicy", () => {
  it("should have valid presets", () => {
    expect(SECURITY_PRESETS.safe).toBeDefined();
    expect(SECURITY_PRESETS.balanced).toBeDefined();
    expect(SECURITY_PRESETS.power).toBeDefined();
    expect(SECURITY_PRESETS.developer).toBeDefined();
  });

  it("should create policy from preset", () => {
    const policy = createSecurityPolicy("balanced");

    expect(policy.permissions.bash).toBe("sandbox");
    expect(policy.permissions.file).toBe("workspace");
    expect(policy.sandbox.type).toBe("process");
  });

  it("should build custom policies with builder", () => {
    const policy = securityPolicy()
      .withBashPermission("full")
      .withFilePermission("home")
      .withTimeLimit(60000)
      .build();

    expect(policy.permissions.bash).toBe("full");
    expect(policy.permissions.file).toBe("home");
    expect(policy.limits.maxExecutionTimeMs).toBe(60000);
  });
});

describe("AuditLogger", () => {
  it("should log and retrieve entries", () => {
    const logger = createAuditLogger();

    logger.log({
      timestamp: Date.now(),
      toolName: "bash:execute",
      action: "call",
      input: { command: "ls" },
      sandboxed: true,
    });

    const entries = logger.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].toolName).toBe("bash:execute");
  });

  it("should filter entries", () => {
    const logger = createAuditLogger();

    logger.log({
      timestamp: Date.now(),
      toolName: "bash:execute",
      action: "call",
      sandboxed: true,
    });

    logger.log({
      timestamp: Date.now(),
      toolName: "file:read",
      action: "result",
      sandboxed: false,
    });

    const bashEntries = logger.getEntries({ toolName: "bash:execute" });
    expect(bashEntries.length).toBe(1);

    const resultEntries = logger.getEntries({ action: "result" });
    expect(resultEntries.length).toBe(1);
  });
});

// ============================================================================
// Orchestrator Tests
// ============================================================================

describe("AgentOrchestrator", () => {
  let registry: ReturnType<typeof createToolRegistry>;
  let llm: ReturnType<typeof createMockLLM>;

  beforeEach(async () => {
    registry = createToolRegistry();
    await registry.register(createCompletionToolServer());
    await registry.register(createFileToolServer());
    await registry.register(createLFCCToolServer());

    llm = createMockLLM();
  });

  it("should run a simple conversation", async () => {
    llm.setDefaultResponse({
      content: "Task complete.",
      finishReason: "tool_use",
      toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Task complete." } }],
    });

    const agent = createOrchestrator(llm, registry, {
      systemPrompt: "You are a helpful assistant.",
    });

    const state = await agent.run("Hello!");

    expect(state.status).toBe("complete");
    expect(state.messages.length).toBeGreaterThan(1);
  });

  it("should emit events during execution", async () => {
    llm.setDefaultResponse({
      content: "Done.",
      finishReason: "tool_use",
      toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Done." } }],
    });

    const agent = createOrchestrator(llm, registry);
    const events: string[] = [];

    agent.on((event) => {
      events.push(event.type);
    });

    await agent.run("Test");

    expect(events).toContain("turn:start");
    expect(events).toContain("complete");
  });

  it("should handle tool calls", async () => {
    // Create a counter to track calls
    let callCount = 0;

    // Override the complete method to handle the flow
    llm.complete = async () => {
      callCount++;
      if (callCount === 1) {
        // First call: trigger tool use
        return {
          content: "Let me list the files.",
          toolCalls: [{ name: "file:list", arguments: { path: "/tmp" } }],
          finishReason: "tool_use" as const,
        };
      }
      // Second call: complete
      return {
        content: "Here are the files in /tmp.",
        toolCalls: [
          {
            name: "completion:complete_task",
            arguments: { summary: "Listed files in /tmp." },
          },
        ],
        finishReason: "tool_use" as const,
      };
    };

    const agent = createOrchestrator(llm, registry, {
      requireConfirmation: false,
    });

    const state = await agent.run("Please list files in /tmp");

    expect(state.status).toBe("complete");
    expect(state.messages.some((m) => m.role === "tool")).toBe(true);
    expect(callCount).toBe(2);
  });

  it("should compact context when history exceeds threshold", async () => {
    const initialMessages: AgentMessage[] = [
      { role: "system", content: "System prompt" },
      ...Array.from({ length: 6 }).flatMap((_, index) => [
        {
          role: "user",
          content: `User message ${index}: ${"detail ".repeat(40)}`,
        },
        {
          role: "assistant",
          content: `Assistant reply ${index}: ${"response ".repeat(40)}`,
        },
      ]),
    ];

    const sessionState = new InMemorySessionState({
      initialState: {
        turn: 0,
        messages: initialMessages,
        pendingToolCalls: [],
        status: "idle",
      },
    });

    const compactor = createContextCompactor({
      targetThreshold: 1,
      contextConfig: {
        maxTokens: 500,
        compressionThreshold: 0.01,
        preserveLastN: 1,
        compressionStrategy: "hybrid",
      },
    });

    let callCount = 0;
    llm.complete = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          content: "Listing files.",
          toolCalls: [{ name: "file:list", arguments: { path: "/tmp" } }],
          finishReason: "tool_use" as const,
        };
      }
      return {
        content: "Done.",
        toolCalls: [
          {
            name: "completion:complete_task",
            arguments: { summary: "Listed files." },
          },
        ],
        finishReason: "tool_use" as const,
      };
    };

    const agent = createOrchestrator(llm, registry, {
      requireConfirmation: false,
      components: { sessionState, contextCompactor: compactor },
    });

    const state = await agent.run("Trigger compaction");
    const summaryMessage = state.messages.find(
      (message) => message.role === "system" && message.content.startsWith("[Conversation Summary]")
    );

    expect(summaryMessage).toBeDefined();
    expect(state.messages[0]?.role).toBe("system");
    expect(state.messages[0]?.content).toBe("System prompt");
    expect(state.messages.length).toBeLessThan(initialMessages.length);
  });

  it("should respect max turns limit", async () => {
    // LLM always wants to use tools (infinite loop)
    llm.setDefaultResponse({
      content: "Let me check.",
      toolCalls: [{ name: "file:list", arguments: { path: "/tmp" } }],
      finishReason: "tool_use",
    });

    const agent = createOrchestrator(llm, registry, {
      maxTurns: 3,
      requireConfirmation: false,
    });

    const state = await agent.run("Keep going");

    expect(state.turn).toBe(3);
    expect(state.status).toBe("error");
  });

  it("should stop on abort", async () => {
    llm.setDefaultResponse({
      content: "Working...",
      toolCalls: [{ name: "file:list", arguments: { path: "/tmp" } }],
      finishReason: "tool_use",
    });

    const agent = createOrchestrator(llm, registry, {
      requireConfirmation: false,
      maxTurns: 10,
    });

    // Start running and immediately stop
    const promise = agent.run("Start");
    // Give it a moment to start, then stop
    await new Promise((r) => setTimeout(r, 10));
    agent.stop();

    const state = await promise;
    // Status should be error after stop, or may still be in executing if stopped mid-loop
    expect(["error", "executing"]).toContain(state.status);
  });
});
