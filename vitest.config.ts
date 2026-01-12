import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(rootDir, "apps/reader/src"),
    },
  },
  test: {
    include: ["packages/**/__tests__/**/*.test.ts", "apps/**/__tests__/**/*.test.ts"],
    environment: "node",
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
