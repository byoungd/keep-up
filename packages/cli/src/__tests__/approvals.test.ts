import type { ConfirmationRequest } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createConfirmationHandler } from "../utils/approvals";

describe("approval handler", () => {
  it("auto-approves when policy allows without prompting", async () => {
    let prompted = false;
    const handler = createConfirmationHandler({
      mode: "ask",
      ask: async () => {
        prompted = true;
        return "n";
      },
      quiet: true,
      autoApproval: {
        policies: [
          {
            name: "allow-read",
            tools: ["file:read"],
            action: "approve",
            priority: 1,
          },
        ],
        workspacePaths: ["/workspace"],
      },
    });

    const request: ConfirmationRequest = {
      toolName: "file:read",
      description: "Read a file",
      arguments: { path: "/workspace/notes.md" },
      risk: "low",
    };

    const approved = await handler?.(request);
    expect(approved).toBe(true);
    expect(prompted).toBe(false);
  });

  it("falls back to prompt when policy requires confirmation", async () => {
    let prompted = false;
    const handler = createConfirmationHandler({
      mode: "ask",
      ask: async () => {
        prompted = true;
        return "y";
      },
      quiet: true,
      autoApproval: {
        policies: [
          {
            name: "ask-write",
            tools: ["file:write"],
            action: "ask",
            priority: 1,
          },
        ],
        workspacePaths: ["/workspace"],
      },
    });

    const request: ConfirmationRequest = {
      toolName: "file:write",
      description: "Write a file",
      arguments: { path: "/workspace/notes.md" },
      risk: "medium",
    };

    const approved = await handler?.(request);
    expect(approved).toBe(true);
    expect(prompted).toBe(true);
  });
});
