import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ku0/agent-runtime-core": path.resolve(__dirname, "../agent-runtime-core/src/index.ts"),
      "@ku0/agent-runtime-control": path.resolve(
        __dirname,
        "../agent-runtime-control/src/index.ts"
      ),
      "@ku0/agent-runtime-sandbox": path.resolve(
        __dirname,
        "../agent-runtime-sandbox/src/index.ts"
      ),
      "@ku0/agent-runtime-telemetry/logging": path.resolve(
        __dirname,
        "../agent-runtime-telemetry/src/logging/index.ts"
      ),
      "@ku0/agent-runtime-telemetry/telemetry": path.resolve(
        __dirname,
        "../agent-runtime-telemetry/src/telemetry/index.ts"
      ),
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
