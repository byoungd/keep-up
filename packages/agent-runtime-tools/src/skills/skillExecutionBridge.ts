import * as path from "node:path";
import type {
  AuditLogger,
  MCPToolCall,
  MCPToolResult,
  ToolContext,
  ToolExecutor,
} from "@ku0/agent-runtime-core";
import { errorResult } from "../tools/mcp/baseServer";
import type { SkillRegistry } from "./skillRegistry";
import type { SkillResolver } from "./skillResolver";

export type SkillScriptRequest = {
  skillId: string;
  scriptPath: string;
  timeoutMs?: number;
  context: ToolContext;
};

export type SkillExecutionBridgeOptions = {
  registry: SkillRegistry;
  resolver: SkillResolver;
  executor: ToolExecutor;
  audit?: AuditLogger;
};

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".sh": "bash",
};

export class SkillExecutionBridge {
  private readonly registry: SkillRegistry;
  private readonly resolver: SkillResolver;
  private readonly executor: ToolExecutor;
  private readonly audit?: AuditLogger;

  constructor(options: SkillExecutionBridgeOptions) {
    this.registry = options.registry;
    this.resolver = options.resolver;
    this.executor = options.executor;
    this.audit = options.audit;
  }

  async runScript(request: SkillScriptRequest): Promise<MCPToolResult> {
    if (this.registry.isDisabled(request.skillId)) {
      return errorResult("PERMISSION_DENIED", `Skill is disabled: ${request.skillId}`);
    }

    const entry = this.registry.get(request.skillId);
    if (!entry) {
      return errorResult("RESOURCE_NOT_FOUND", `Skill not found: ${request.skillId}`);
    }

    const ext = path.extname(request.scriptPath).toLowerCase();
    const language = EXTENSION_LANGUAGE[ext];
    if (!language) {
      return errorResult("INVALID_ARGUMENTS", "Unsupported script extension");
    }

    const script = await this.resolver.readResource(request.skillId, request.scriptPath, "utf-8");
    if ("error" in script) {
      return errorResult("RESOURCE_NOT_FOUND", script.error);
    }

    const argumentsPayload: Record<string, unknown> = {
      language,
      code: script.content,
      cwd: entry.path,
    };
    if (request.timeoutMs !== undefined) {
      argumentsPayload.timeout = request.timeoutMs;
    }

    const call: MCPToolCall = {
      name: "code:run",
      arguments: argumentsPayload,
    };

    const result = await this.executor.execute(call, request.context);

    this.emitScriptExecuted(request, entry.path, language, result);

    return result;
  }

  private emitScriptExecuted(
    request: SkillScriptRequest,
    skillPath: string,
    language: string,
    result: MCPToolResult
  ): void {
    this.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.script_executed",
      action: "result",
      userId: request.context.userId,
      correlationId: request.context.correlationId,
      input: {
        skillId: request.skillId,
        scriptPath: request.scriptPath,
        language,
        cwd: skillPath,
      },
      output: { isError: result.error !== undefined },
      sandboxed: request.context.security?.sandbox?.type !== "none",
    });
  }
}

export function createSkillExecutionBridge(
  options: SkillExecutionBridgeOptions
): SkillExecutionBridge {
  return new SkillExecutionBridge(options);
}
