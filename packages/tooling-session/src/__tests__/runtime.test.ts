import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeResources } from "../runtime";

const REQUIRED_SERVERS = ["completion", "file", "code_interaction", "bash", "browser", "web"];

describe("tooling-session runtime", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("registers the core toolchain for CLI runtimes", async () => {
    process.env.OPENAI_API_KEY = originalApiKey ?? "test-key";
    const { runtime } = await createRuntimeResources({
      provider: "openai",
      model: "auto",
    });

    for (const serverName of REQUIRED_SERVERS) {
      expect(runtime.registry.getServer(serverName)).toBeDefined();
    }

    const tools = runtime.registry.listTools().map((tool) => tool.name);
    expect(tools).toContain("file:read");
    expect(tools).toContain("code_interaction:apply_patch");
    expect(tools).toContain("bash:execute");
    expect(tools).toContain("web:search");
  });
});
