import { defineConfig } from "vitest/config";

import { aliases } from "../../vitest.aliases";

export default defineConfig({
  resolve: {
    alias: aliases,
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
