/**
 * ClarificationToolServer tests
 */

import type {
  ClarificationRequest,
  ClarificationResponse,
  MCPToolResult,
  ToolContext,
} from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { ClarificationToolServer } from "../tools/core/clarification";

function createContext(maxOutputBytes?: number): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions },
      limits: { ...base.limits, maxOutputBytes: maxOutputBytes ?? base.limits.maxOutputBytes },
    },
  };
}

function getText(result: MCPToolResult): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

describe("ClarificationToolServer", () => {
  it("sanitizes options and validates priority", async () => {
    let captured: ClarificationRequest | null = null;
    const handler = {
      requestClarification: async (
        request: ClarificationRequest
      ): Promise<ClarificationResponse> => {
        captured = request;
        return {
          requestId: request.id,
          answer: "ok",
          timestamp: Date.now(),
          responseTime: 1,
        };
      },
    };
    const server = new ClarificationToolServer(handler);
    const context = createContext();

    await server.callTool(
      {
        name: "ask_clarification_question",
        arguments: {
          question: "Need confirmation?",
          options: [" yes ", "", 42],
          priority: "urgent",
        },
      },
      context
    );

    expect(captured?.options).toEqual(["yes"]);
    expect(captured?.priority).toBeUndefined();
  });

  it("truncates large outputs", async () => {
    const handler = {
      requestClarification: async (
        request: ClarificationRequest
      ): Promise<ClarificationResponse> => {
        return {
          requestId: request.id,
          answer: "x".repeat(200),
          timestamp: Date.now(),
          responseTime: 1,
        };
      },
    };
    const server = new ClarificationToolServer(handler);
    const context = createContext(60);

    const result = await server.callTool(
      { name: "ask_clarification_question", arguments: { question: "Need info?" } },
      context
    );

    expect(getText(result)).toContain("Output truncated");
  });
});
