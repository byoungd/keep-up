import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // 各个包的测试配置
  "packages/core/vitest.config.ts",
  "packages/lfcc-bridge/vitest.config.ts",
  "packages/overlay/vitest.config.ts",
  "packages/collab-server/vitest.config.ts",
  "packages/conformance-kit/vitest.config.ts",
  "packages/ingest-youtube/vitest.config.ts",
  "packages/app/vitest.config.ts",
  "packages/compat/vitest.config.ts",
]);
