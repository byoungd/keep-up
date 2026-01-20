import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ku0/ai-core": path.resolve(__dirname, "../ai-core/src/index.ts"),
      "@ku0/agent-runtime-core": path.resolve(__dirname, "../agent-runtime-core/src/index.ts"),
      "@ku0/agent-runtime-sandbox": path.resolve(
        __dirname,
        "../agent-runtime-sandbox/src/index.ts"
      ),
      "@ku0/agent-runtime-tools": path.resolve(__dirname, "../agent-runtime-tools/src"),
    },
  },
  test: {
    include: resolveIncludes(),
  },
});

function resolveIncludes(): string[] {
  const includeEnv = process.env.VITEST_INCLUDE;
  if (includeEnv) {
    const parsed = includeEnv
      .split(",")
      .map((pattern) => pattern.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return ["src/**/*.test.ts"];
}
