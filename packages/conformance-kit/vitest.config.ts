import { defineConfig } from "vitest/config";

import { aliases } from "../../vitest.aliases";

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
