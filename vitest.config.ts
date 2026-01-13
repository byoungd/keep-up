import path from "node:path";

import { defineConfig } from "vitest/config";

// Root configuration - used by vitest.workspace.ts
// Package-specific configurations are in their respective vitest.config.ts files
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/reader/src"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/.out/**",
    ],
    server: {
      deps: {
        inline: ["rss-parser"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
