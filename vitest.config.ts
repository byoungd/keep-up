import path from "node:path";

import { defineConfig } from "vitest/config";

// 根配置 - 被 vitest.workspace.ts 使用
// 各包的具体配置在各自的 vitest.config.ts 中
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
