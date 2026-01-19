import { describe, expect, it } from "vitest";
import type { HookInput } from "../hooks/HookConfig";
import { HookExecutor } from "../hooks/HookExecutor";

const nodeCommand = (payload: string) => `${process.execPath} -e "console.log('${payload}')"`;

describe("HookExecutor", () => {
  it("runs matching hooks and merges context", async () => {
    const executor = new HookExecutor();
    executor.register({
      name: "hook-one",
      type: "PreToolUse",
      toolPatterns: ["file:*"],
      command: nodeCommand('{"contextModification":"one"}'),
      timeoutMs: 1000,
      isCancellable: false,
    });
    executor.register({
      name: "hook-two",
      type: "PreToolUse",
      toolPatterns: ["file:write"],
      command: nodeCommand('{"contextModification":"two"}'),
      timeoutMs: 1000,
      isCancellable: false,
    });

    const input: HookInput = {
      preToolUse: { toolName: "file:write", parameters: { path: "a" } },
    };

    const result = await executor.execute("PreToolUse", input, "file:write");
    expect(result.contextModification).toContain("one");
    expect(result.contextModification).toContain("two");
  });
});
