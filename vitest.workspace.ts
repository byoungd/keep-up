import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineWorkspace } from "vitest/config";

const workspaceConfigs = [
  "packages/core/vitest.config.ts",
  "packages/lfcc-bridge/vitest.config.ts",
  "packages/overlay/vitest.config.ts",
  "packages/collab-server/vitest.config.ts",
  "packages/conformance-kit/vitest.config.ts",
  "packages/ingest-youtube/vitest.config.ts",
  "packages/app/vitest.config.ts",
  "packages/compat/vitest.config.ts",
];

const existingConfigs = workspaceConfigs.filter((config) => existsSync(resolve(config)));

export default defineWorkspace(existingConfigs);
