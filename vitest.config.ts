import { defineConfig, defineProject } from "vitest/config";

import { aliases } from "./vitest.aliases";

const defaultExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/.out/**",
];

export default defineConfig({
  resolve: {
    alias: aliases,
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
        inline: [/@ku0\/.*/, "rss-parser"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      reportsDirectory: "coverage",
    },
    projects: [
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "core-conformance",
          include: [
            "packages/core/src/**/__tests__/**/*.test.ts",
            "packages/conformance-kit/src/**/__tests__/**/*.test.ts",
          ],
          exclude: defaultExclude,
          environment: "node",
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "app-jsdom",
          include: ["packages/app/src/**/*.test.ts"],
          exclude: defaultExclude,
          environment: "jsdom",
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "shell-jsdom",
          include: ["packages/shell/src/**/*.test.ts", "packages/shell/src/**/*.test.tsx"],
          exclude: defaultExclude,
          environment: "jsdom",
          setupFiles: ["packages/shell/src/test/setup.ts"],
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "packages-default",
          include: [
            "packages/lfcc-bridge/src/**/*.test.ts",
            "packages/overlay/src/**/*.test.ts",
            "packages/compat/src/**/*.test.ts",
            "packages/ingest-youtube/src/**/*.test.ts",
            "packages/ai-core/src/**/*.test.ts",
            "packages/cli/src/**/*.test.ts",
            "packages/agent-runtime-tools/src/**/*.test.ts",
            "packages/agent-runtime-execution/src/**/*.test.ts",
            "packages/agent-runtime-memory/src/**/*.test.ts",
            "packages/agent-runtime-telemetry/src/**/*.test.ts",
            "packages/agent-runtime-persistence/src/**/*.test.ts",
            "packages/agent-runtime-sandbox/src/**/*.test.ts",
            "packages/agent-runtime-control/src/**/*.test.ts",
            "packages/agent-runtime-core/src/**/*.test.ts",
            "packages/agent-runtime-vision/src/**/*.test.ts",
            "packages/tokenizer-rs/src/**/*.test.ts",
            "packages/diff-rs/src/**/*.test.ts",
            "packages/storage-engine-rs/src/**/*.test.ts",
            "packages/agent-gym/src/**/*.test.ts",
          ],
          exclude: defaultExclude,
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "cowork-server",
          include: ["apps/cowork/server/**/*.test.ts"],
          exclude: defaultExclude,
          environment: "node",
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "cowork-app",
          include: ["apps/cowork/src/**/*.test.ts"],
          exclude: defaultExclude,
          environment: "node",
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
      defineProject({
        resolve: {
          alias: aliases,
        },
        test: {
          name: "context-index",
          include: ["packages/context-index/src/**/*.test.ts"],
          exclude: defaultExclude,
          environment: "node",
          server: {
            deps: {
              inline: [/@ku0\/.*/],
            },
          },
        },
      }),
    ],
  },
});
