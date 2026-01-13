import { defineProject } from "vitest/config";

const defaultExclude = ["**/node_modules/**", "**/dist/**"];

export default [
  defineProject({
    test: {
      name: "core-conformance",
      include: [
        "packages/core/src/**/__tests__/**/*.test.ts",
        "packages/conformance-kit/src/**/__tests__/**/*.test.ts",
      ],
      exclude: defaultExclude,
      environment: "node",
    },
  }),
  defineProject({
    test: {
      name: "collab-server",
      include: ["packages/collab-server/src/**/*.test.ts"],
      exclude: defaultExclude,
      globals: true,
      coverage: {
        reporter: ["text", "json", "html"],
      },
    },
  }),
  defineProject({
    test: {
      name: "app-jsdom",
      include: ["packages/app/src/**/*.test.ts"],
      exclude: defaultExclude,
      environment: "jsdom",
    },
  }),
  defineProject({
    test: {
      name: "packages-default",
      include: [
        "packages/lfcc-bridge/src/**/*.test.ts",
        "packages/overlay/src/**/*.test.ts",
        "packages/compat/src/**/*.test.ts",
        "packages/ingest-youtube/src/**/*.test.ts",
        "packages/agent-runtime/src/**/*.test.ts",
      ],
      exclude: defaultExclude,
    },
  }),
];
