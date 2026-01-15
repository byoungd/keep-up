import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AgentLLMRequest,
  type AgentLLMResponse,
  type AgentState,
  type IAgentLLM,
  type MCPToolCall,
  type SkillActivation,
  SkillPromptAdapter,
  type ToolContext,
  type ToolExecutor,
  createKernel,
  createMessageCompressor,
  createPermissionChecker,
  createRequestCache,
  createSecurityPolicy,
  createSkillPolicyGuard,
  createSkillRegistry,
  createSkillResolver,
  createSkillSession,
  createSkillToolServer,
  createToolRegistry,
  createTurnExecutor,
} from "../index";
import type { ToolPolicyContext, ToolPolicyEngine } from "../security";
import type { MCPToolResult } from "../types";

const VALID_SKILL = `---
name: pdf-processing
description: Extracts tables from PDFs.
allowed-tools:
  - file:read
---
# PDF Processing
`;

const INVALID_SKILL = `---
name: BadName
description: Invalid name.
---
# Invalid
`;

const CLAUDE_STYLE_SKILL = `---
name: cli-helper
description: Uses git and reads files.
allowed-tools: Bash(git:*) Read
---
# CLI Helper
`;

describe("SkillRegistry", () => {
  it("discovers valid skills and rejects invalid ones", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-registry-"));
    const validDir = path.join(root, "pdf-processing");
    const invalidDir = path.join(root, "invalid-skill");

    await fs.mkdir(validDir, { recursive: true });
    await fs.writeFile(path.join(validDir, "SKILL.md"), VALID_SKILL, "utf-8");

    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(path.join(invalidDir, "SKILL.md"), INVALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });

    const result = await registry.discover();

    expect(result.skills.map((skill) => skill.name)).toEqual(["pdf-processing"]);
    expect(result.errors.length).toBe(1);
  });

  it("prefers higher precedence sources", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-precedence-"));
    const builtinRoot = path.join(root, "builtin");
    const userRoot = path.join(root, "user");

    const builtinSkill = path.join(builtinRoot, "pdf-processing");
    const userSkill = path.join(userRoot, "pdf-processing");

    await fs.mkdir(builtinSkill, { recursive: true });
    await fs.mkdir(userSkill, { recursive: true });

    await fs.writeFile(path.join(builtinSkill, "SKILL.md"), VALID_SKILL, "utf-8");
    await fs.writeFile(path.join(userSkill, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [
        { path: userRoot, source: "user" },
        { path: builtinRoot, source: "builtin" },
      ],
    });

    await registry.discover();

    const entry = registry.get("pdf-processing");
    expect(entry?.source).toBe("builtin");
  });

  it("reuses cached entries when files are unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-cache-"));
    const skillDir = path.join(root, "pdf-processing");
    const skillFile = path.join(skillDir, "SKILL.md");
    const cachePath = path.join(root, "cache.json");

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillFile, VALID_SKILL, "utf-8");

    const fixedTimeMs = Math.floor((Date.now() - 5000) / 1000) * 1000;
    const fixedTime = new Date(fixedTimeMs);
    await fs.utimes(skillFile, fixedTime, fixedTime);

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
      cachePath,
    });

    await registry.discover();

    const initialDescription = registry.get("pdf-processing")?.description;

    const updatedSkill = VALID_SKILL.replace("Extracts tables from PDFs.", "Updated description.");
    await fs.writeFile(skillFile, updatedSkill, "utf-8");
    await fs.utimes(skillFile, fixedTime, fixedTime);

    const secondResult = await registry.discover();
    const cachedDescription = registry.get("pdf-processing")?.description;

    expect(secondResult.errors.length).toBe(0);
    expect(cachedDescription).toBe(initialDescription);

    const cacheContent = await fs.readFile(cachePath, "utf-8");
    expect(cacheContent).toContain("pdf-processing");
  });

  it("rejects compatibility strings over 500 characters", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-compat-"));
    const skillDir = path.join(root, "compat-skill");
    const longCompatibility = "a".repeat(501);

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: compat-skill\ndescription: Test\ncompatibility: ${longCompatibility}\n---\n# Test\n`,
      "utf-8"
    );

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });

    const result = await registry.discover();

    expect(result.skills.length).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  it("allows custom compatibility length overrides", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-compat-override-"));
    const skillDir = path.join(root, "compat-skill");
    const longCompatibility = "b".repeat(501);

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: compat-skill\ndescription: Test\ncompatibility: ${longCompatibility}\n---\n# Test\n`,
      "utf-8"
    );

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
      validation: { compatibilityMaxLength: 600 },
    });

    const result = await registry.discover();

    expect(result.errors.length).toBe(0);
    expect(result.skills.length).toBe(1);
    expect(result.skills[0]?.compatibility?.length).toBe(501);
  });
});

describe("SkillPromptAdapter", () => {
  it("formats available skills as XML", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-prompt-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const adapter = new SkillPromptAdapter({ includeLocation: false });
    const prompt = adapter.formatAvailableSkills(registry.list());

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>pdf-processing</name>");
    expect(prompt).toContain("<description>");
    expect(prompt).not.toContain("<location>");
  });
});

describe("TurnExecutor skills injection", () => {
  it("injects available skills into system prompt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-executor-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const llm = new CapturingLLM();
    const executor = createTurnExecutor(
      {
        llm,
        messageCompressor: createMessageCompressor(),
        requestCache: createRequestCache(),
        skillRegistry: registry,
        skillPromptAdapter: new SkillPromptAdapter({ includeLocation: false }),
        getToolDefinitions: () => [],
      },
      {
        systemPrompt: "Base system prompt.",
      }
    );

    const state: AgentState = {
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      pendingToolCalls: [],
      status: "idle",
    };

    await executor.execute(state);

    expect(llm.lastRequest?.systemPrompt).toContain("<available_skills>");
    expect(llm.lastRequest?.systemPrompt).toContain("pdf-processing");
  });
});

describe("SkillPolicyGuard", () => {
  it("enforces allowed-tools allowlist", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-allowlist-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const session = createSkillSession(registry);
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
      sessionId: "session",
      skills: { activeSkills: [] },
    };

    const activation = session.activate("pdf-processing", context) as SkillActivation;
    context.skills = { activeSkills: [activation] };

    const baseEngine: ToolPolicyEngine = {
      evaluate: () => ({ allowed: true, requiresConfirmation: false }),
    };

    const guard = createSkillPolicyGuard(baseEngine, registry);

    const allowContext = createPolicyContext("file:read", context, { path: "README.md" });
    const denyContext = createPolicyContext("bash:execute", context, { command: "ls" });

    expect(guard.evaluate(allowContext).allowed).toBe(true);
    expect(guard.evaluate(denyContext).allowed).toBe(false);
  });

  it("supports Claude-style allowed-tools patterns", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-claude-"));
    const skillDir = path.join(root, "cli-helper");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), CLAUDE_STYLE_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const session = createSkillSession(registry);
    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
      sessionId: "session",
      skills: { activeSkills: [] },
    };

    const activation = session.activate("cli-helper", context) as SkillActivation;
    context.skills = { activeSkills: [activation] };

    const baseEngine: ToolPolicyEngine = {
      evaluate: () => ({ allowed: true, requiresConfirmation: false }),
    };

    const guard = createSkillPolicyGuard(baseEngine, registry);

    const gitContext = createPolicyContext("bash:execute", context, { command: "git status" });
    const lsContext = createPolicyContext("bash:execute", context, { command: "ls -la" });
    const readContext = createPolicyContext("file:read", context, { path: "README.md" });
    const writeContext = createPolicyContext("file:write", context, { path: "README.md" });

    expect(guard.evaluate(gitContext).allowed).toBe(true);
    expect(guard.evaluate(lsContext).allowed).toBe(false);
    expect(guard.evaluate(readContext).allowed).toBe(true);
    expect(guard.evaluate(writeContext).allowed).toBe(false);
  });
});

describe("SkillResolver", () => {
  it("blocks path traversal in resources", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-resolver-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const resolver = createSkillResolver({ registry });
    const result = await resolver.readResource("pdf-processing", "../secret.txt", "utf-8");

    expect("error" in result).toBe(true);
  });

  it("rejects access when a skill is disabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-disabled-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();
    registry.disable("pdf-processing");

    const resolver = createSkillResolver({ registry });
    const result = await resolver.loadSkill("pdf-processing");

    expect("error" in result).toBe(true);
  });
});

describe("SkillToolServer", () => {
  it("reads a skill and activates it in the session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-toolserver-read-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const session = createSkillSession(registry);
    const executor = new CapturingExecutor();
    const server = createSkillToolServer({ registry, executor, session });

    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
      sessionId: "session",
    };

    const result = await server.callTool(
      { name: "read", arguments: { skillId: "pdf-processing" } },
      context
    );

    expect(result.success).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("# PDF Processing");
    expect(session.isActive("pdf-processing")).toBe(true);
  });

  it("executes a skill script via code:run with cwd and timeout", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-toolserver-run-"));
    const skillDir = path.join(root, "script-skill");
    const scriptDir = path.join(skillDir, "scripts");
    const scriptPath = path.join(scriptDir, "hello.sh");
    const scriptContent = 'echo "hello"';

    await fs.mkdir(scriptDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: script-skill\ndescription: Runs a script.\n---\n# Script Skill\n",
      "utf-8"
    );
    await fs.writeFile(scriptPath, scriptContent, "utf-8");

    const registry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await registry.discover();

    const executor = new CapturingExecutor();
    const server = createSkillToolServer({ registry, executor });

    const context: ToolContext = {
      security: createSecurityPolicy("balanced"),
      sessionId: "session",
    };

    const result = await server.callTool(
      {
        name: "run_script",
        arguments: { skillId: "script-skill", path: "scripts/hello.sh", timeoutMs: 1234 },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(executor.calls.length).toBe(1);
    const call = executor.calls[0];
    expect(call?.name).toBe("code:run");
    expect(call?.arguments).toMatchObject({
      language: "bash",
      code: scriptContent,
      cwd: skillDir,
      timeout: 1234,
    });
  });
});

describe("Kernel skills enforcement", () => {
  it("blocks disallowed tool calls even with a custom executor", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kernel-"));
    const skillDir = path.join(root, "pdf-processing");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf-8");

    const skillRegistry = createSkillRegistry({
      roots: [{ path: root, source: "user" }],
    });
    await skillRegistry.discover();

    const skillSession = createSkillSession(skillRegistry);
    const security = createSecurityPolicy("balanced");
    skillSession.activate("pdf-processing", {
      security,
      sessionId: "session",
    });

    const registry = createToolRegistry();
    const llm = new ToolCallLLM({
      name: "bash:execute",
      arguments: { command: "echo test" },
    });
    const executor = new AllowAllExecutor();
    const policy = createPermissionChecker(security);

    const kernel = createKernel(
      {
        llm,
        registry,
        executor,
        policy,
      },
      {
        orchestrator: {
          requireConfirmation: false,
          maxTurns: 1,
        },
        skills: {
          registry: skillRegistry,
          session: skillSession,
        },
      }
    );

    const state = await kernel.run("run tool");
    const toolMessage = state.messages.find((message) => message.role === "tool");

    expect(toolMessage && "result" in toolMessage).toBe(true);
    if (toolMessage && "result" in toolMessage) {
      expect(toolMessage.result.success).toBe(false);
      expect(toolMessage.result.error?.code).toBe("PERMISSION_DENIED");
    }
    expect(executor.calls).toBe(0);
  });
});

function createPolicyContext(
  toolName: string,
  context: ToolContext,
  args: Record<string, unknown>
): ToolPolicyContext {
  const [tool, operation] = toolName.split(":");
  return {
    call: { name: toolName, arguments: args },
    tool,
    operation,
    context,
  };
}

class CapturingLLM implements IAgentLLM {
  lastRequest: AgentLLMRequest | undefined;

  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    this.lastRequest = request;
    return { content: "ok", finishReason: "stop" };
  }
}

class ToolCallLLM implements IAgentLLM {
  constructor(private readonly call: MCPToolCall) {}

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "", toolCalls: [this.call], finishReason: "tool_use" };
  }
}

class AllowAllExecutor implements ToolExecutor {
  calls = 0;

  async execute(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    this.calls += 1;
    return {
      success: true,
      content: [{ type: "text", text: "ok" }],
    };
  }
}

class CapturingExecutor implements ToolExecutor {
  calls: MCPToolCall[] = [];

  async execute(call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    this.calls.push(call);
    return {
      success: true,
      content: [{ type: "text", text: "ok" }],
    };
  }
}
