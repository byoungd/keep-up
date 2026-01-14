import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@keepup/ai-core": path.resolve(__dirname, "../ai-core/src/index.ts"),
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
