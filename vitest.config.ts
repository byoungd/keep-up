import path from "node:path";

import { defineConfig } from "vitest/config";

// Root configuration - used by vitest.workspace.ts
// Package-specific configurations are in their respective vitest.config.ts files
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/reader/src"),
      "@ku0/agent-runtime": path.resolve(__dirname, "packages/agent-runtime/src/index.ts"),
      "@ku0/ai-core": path.resolve(__dirname, "packages/ai-core/src/index.ts"),
      "@ku0/app": path.resolve(__dirname, "packages/app/src/index.ts"),
      "@ku0/bench": path.resolve(__dirname, "packages/bench/src/index.ts"),
      "@ku0/collab-server-lib": path.resolve(__dirname, "packages/collab-server/src/index.ts"),
      "@ku0/compat": path.resolve(__dirname, "packages/compat/src/index.ts"),
      "@ku0/conformance-kit": path.resolve(__dirname, "packages/conformance-kit/src/index.ts"),
      "@ku0/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@ku0/core/sync": path.resolve(__dirname, "packages/core/src/sync/index.ts"),
      "@ku0/core/sync/server": path.resolve(__dirname, "packages/core/src/sync/server.ts"),
      "@ku0/core/security": path.resolve(__dirname, "packages/core/src/security/index.ts"),
      "@ku0/crypto": path.resolve(__dirname, "packages/crypto/src/index.ts"),
      "@ku0/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@ku0/db/types": path.resolve(__dirname, "packages/db/src/driver/types.ts"),
      "@ku0/db/web": path.resolve(__dirname, "packages/db/src/web/index.ts"),
      "@ku0/db/worker": path.resolve(__dirname, "packages/db/src/worker/index.ts"),
      "@ku0/ingest-file": path.resolve(__dirname, "packages/ingest/file/src/index.ts"),
      "@ku0/ingest-rss": path.resolve(__dirname, "packages/ingest/rss/src/index.ts"),
      "@ku0/ingest-youtube": path.resolve(__dirname, "packages/ingest-youtube/src/index.ts"),
      "@ku0/lfcc-bridge": path.resolve(__dirname, "packages/lfcc-bridge/src/index.ts"),
      "@ku0/overlay": path.resolve(__dirname, "packages/overlay/src/index.ts"),
      "@ku0/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@ku0/shared/utils": path.resolve(__dirname, "packages/shared/src/utils/index.ts"),
      "@ku0/shared/ui/motion": path.resolve(__dirname, "packages/shared/src/ui/motion.ts"),
      "@ku0/token": path.resolve(__dirname, "packages/token/src/index.ts"),
      "@ku0/translator": path.resolve(__dirname, "packages/translator/src/index.ts"),
      "@ku0/tts": path.resolve(__dirname, "packages/tts/src/index.ts"),
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
