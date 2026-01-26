import { defineConfig } from "vitest/config";
import { aliases } from "../../vitest.aliases";

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
    server: {
      deps: {
        inline: [/@ku0\/.*/],
      },
    },
  },
});
