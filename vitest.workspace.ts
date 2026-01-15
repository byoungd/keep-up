import path from "node:path";

import { defineProject } from "vitest/config";

const defaultExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/.out/**",
];

// Define aliases as an array to ensure subpaths are matched before their parent packages
// preventing shadowing issues (e.g. @ku0/core shadowing @ku0/core/security)
const aliases = [
  // Subpaths first
  {
    find: "@ku0/core/sync/server",
    replacement: path.resolve(__dirname, "packages/core/src/sync/server.ts"),
  },
  {
    find: "@ku0/core/sync",
    replacement: path.resolve(__dirname, "packages/core/src/sync/index.ts"),
  },
  {
    find: "@ku0/core/security",
    replacement: path.resolve(__dirname, "packages/core/src/security/index.ts"),
  },

  {
    find: "@ku0/db/types",
    replacement: path.resolve(__dirname, "packages/db/src/driver/types.ts"),
  },
  { find: "@ku0/db/web", replacement: path.resolve(__dirname, "packages/db/src/web/index.ts") },
  {
    find: "@ku0/db/worker",
    replacement: path.resolve(__dirname, "packages/db/src/worker/index.ts"),
  },

  {
    find: "@ku0/shared/utils",
    replacement: path.resolve(__dirname, "packages/shared/src/utils/index.ts"),
  },
  {
    find: "@ku0/shared/ui/motion",
    replacement: path.resolve(__dirname, "packages/shared/src/ui/motion.ts"),
  },

  // LFCC Bridge
  {
    find: "@ku0/lfcc-bridge",
    replacement: path.resolve(__dirname, "packages/lfcc-bridge/src/index.ts"),
  },

  // Main packages
  {
    find: "@ku0/agent-runtime",
    replacement: path.resolve(__dirname, "packages/agent-runtime/src/index.ts"),
  },
  { find: "@ku0/ai-core", replacement: path.resolve(__dirname, "packages/ai-core/src/index.ts") },
  { find: "@ku0/app", replacement: path.resolve(__dirname, "packages/app/src/index.ts") },
  { find: "@ku0/bench", replacement: path.resolve(__dirname, "packages/bench/src/index.ts") },
  {
    find: "@ku0/collab-server-lib",
    replacement: path.resolve(__dirname, "packages/collab-server/src/index.ts"),
  },
  { find: "@ku0/compat", replacement: path.resolve(__dirname, "packages/compat/src/index.ts") },
  {
    find: "@ku0/conformance-kit",
    replacement: path.resolve(__dirname, "packages/conformance-kit/src/index.ts"),
  },
  { find: "@ku0/core", replacement: path.resolve(__dirname, "packages/core/src/index.ts") },
  { find: "@ku0/crypto", replacement: path.resolve(__dirname, "packages/crypto/src/index.ts") },
  { find: "@ku0/db", replacement: path.resolve(__dirname, "packages/db/src/index.ts") },
  {
    find: "@ku0/ingest-file",
    replacement: path.resolve(__dirname, "packages/ingest/file/src/index.ts"),
  },
  {
    find: "@ku0/ingest-rss",
    replacement: path.resolve(__dirname, "packages/ingest/rss/src/index.ts"),
  },
  {
    find: "@ku0/ingest-youtube",
    replacement: path.resolve(__dirname, "packages/ingest-youtube/src/index.ts"),
  },
  { find: "@ku0/overlay", replacement: path.resolve(__dirname, "packages/overlay/src/index.ts") },
  { find: "@ku0/shared", replacement: path.resolve(__dirname, "packages/shared/src/index.ts") },
  { find: "@ku0/token", replacement: path.resolve(__dirname, "packages/token/src/index.ts") },
  {
    find: "@ku0/translator",
    replacement: path.resolve(__dirname, "packages/translator/src/index.ts"),
  },
  { find: "@ku0/tts", replacement: path.resolve(__dirname, "packages/tts/src/index.ts") },
];

export default [
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
      name: "collab-server",
      include: ["packages/collab-server/src/**/*.test.ts"],
      exclude: defaultExclude,
      globals: true,
      coverage: {
        reporter: ["text", "json", "html"],
      },
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
      name: "packages-default",
      include: [
        "packages/lfcc-bridge/src/**/*.test.ts",
        "packages/overlay/src/**/*.test.ts",
        "packages/compat/src/**/*.test.ts",
        "packages/ingest-youtube/src/**/*.test.ts",
        "packages/agent-runtime/src/**/*.test.ts",
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
];
