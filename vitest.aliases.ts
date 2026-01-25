/**
 * Vitest alias configuration for workspace packages.
 *
 * This file centralizes all package aliases used by Vitest.
 * Aliases are ordered so that subpaths are matched before their parent packages.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AliasEntry = { find: string; replacement: string };

export const aliases: AliasEntry[] = [
  // ============================================
  // Subpath exports (must come before parent packages)
  // ============================================

  // @ku0/core subpaths
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

  // @ku0/db subpaths
  {
    find: "@ku0/db/types",
    replacement: path.resolve(__dirname, "packages/db/src/driver/types.ts"),
  },
  {
    find: "@ku0/db/web",
    replacement: path.resolve(__dirname, "packages/db/src/web/index.ts"),
  },
  {
    find: "@ku0/db/worker",
    replacement: path.resolve(__dirname, "packages/db/src/worker/index.ts"),
  },

  // @ku0/shared subpaths
  {
    find: "@ku0/shared/utils",
    replacement: path.resolve(__dirname, "packages/shared/src/utils/index.ts"),
  },
  {
    find: "@ku0/shared/ui/motion",
    replacement: path.resolve(__dirname, "packages/shared/src/ui/motion.ts"),
  },

  // @ku0/native-bindings subpaths
  {
    find: "@ku0/native-bindings/flags",
    replacement: path.resolve(__dirname, "packages/native-bindings/src/flags.ts"),
  },
  {
    find: "@ku0/native-bindings/testing",
    replacement: path.resolve(__dirname, "packages/native-bindings/src/testing/index.ts"),
  },
  {
    find: "@ku0/native-bindings/node",
    replacement: path.resolve(__dirname, "packages/native-bindings/src/node.ts"),
  },

  // @ku0/agent-runtime-execution subpaths
  {
    find: "@ku0/agent-runtime-execution/orchestrator/edge",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-execution/src/orchestrator/edge.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-execution/orchestrator",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-execution/src/orchestrator/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-execution/security",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/security/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-execution/tools/computer",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-execution/src/tools/computer/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-execution/tools",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/tools/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-execution/types",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/types/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-execution/kernel",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/kernel/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-execution/runtime",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/runtime.ts"),
  },

  // @ku0/agent-runtime-persistence subpaths
  {
    find: "@ku0/agent-runtime-persistence/artifacts",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-persistence/src/artifacts/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-persistence/checkpoint",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-persistence/src/checkpoint/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-persistence/execution",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-persistence/src/execution/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-persistence/timetravel",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-persistence/src/timetravel/index.ts"
    ),
  },

  // @ku0/agent-runtime-telemetry subpaths
  {
    find: "@ku0/agent-runtime-telemetry/logging",
    replacement: path.resolve(__dirname, "packages/agent-runtime-telemetry/src/logging/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-telemetry/telemetry",
    replacement: path.resolve(__dirname, "packages/agent-runtime-telemetry/src/telemetry/index.ts"),
  },

  // @ku0/agent-runtime-tools subpaths
  {
    find: "@ku0/agent-runtime-tools/tools/computer",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-tools/src/tools/computer/index.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-tools/tools/core/bash",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/tools/core/bash.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/tools/core/completion",
    replacement: path.resolve(
      __dirname,
      "packages/agent-runtime-tools/src/tools/core/completion.ts"
    ),
  },
  {
    find: "@ku0/agent-runtime-tools/tools/core/file",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/tools/core/file.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/tools/core",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/tools/core/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/tools/mcp",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/tools/mcp/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/tools",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/tools/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/browser",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/browser/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/plugins",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/plugins/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools/skills",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/skills/index.ts"),
  },

  // @ku0/streaming-markdown-rs subpaths
  {
    find: "@ku0/streaming-markdown-rs/node",
    replacement: path.resolve(__dirname, "packages/streaming-markdown-rs/src/node.ts"),
  },
  // @ku0/workspace-session-rs subpaths
  {
    find: "@ku0/workspace-session-rs/node",
    replacement: path.resolve(__dirname, "packages/workspace-session-rs/src/node.ts"),
  },
  {
    find: "@ku0/tool-gateway-rs/node",
    replacement: path.resolve(__dirname, "packages/tool-gateway-rs/src/node.ts"),
  },
  {
    find: "@ku0/model-fabric-rs/node",
    replacement: path.resolve(__dirname, "packages/model-fabric-rs/src/node.ts"),
  },
  {
    find: "@ku0/agent-workforce-rs/node",
    replacement: path.resolve(__dirname, "packages/agent-workforce-rs/src/node.ts"),
  },

  // ============================================
  // Main packages (alphabetical order)
  // ============================================
  {
    find: "@ku0/agent-runtime",
    replacement: path.resolve(__dirname, "packages/agent-runtime/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-control",
    replacement: path.resolve(__dirname, "packages/agent-runtime-control/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-core",
    replacement: path.resolve(__dirname, "packages/agent-runtime-core/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-execution",
    replacement: path.resolve(__dirname, "packages/agent-runtime-execution/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-memory",
    replacement: path.resolve(__dirname, "packages/agent-runtime-memory/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-persistence",
    replacement: path.resolve(__dirname, "packages/agent-runtime-persistence/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-sandbox",
    replacement: path.resolve(__dirname, "packages/agent-runtime-sandbox/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-telemetry",
    replacement: path.resolve(__dirname, "packages/agent-runtime-telemetry/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-tools",
    replacement: path.resolve(__dirname, "packages/agent-runtime-tools/src/index.ts"),
  },
  {
    find: "@ku0/agent-runtime-vision",
    replacement: path.resolve(__dirname, "packages/agent-runtime-vision/src/index.ts"),
  },
  {
    find: "@ku0/ai-context-hash-rs",
    replacement: path.resolve(__dirname, "packages/ai-context-hash-rs/src/index.ts"),
  },
  {
    find: "@ku0/ai-core",
    replacement: path.resolve(__dirname, "packages/ai-core/src/index.ts"),
  },
  {
    find: "@ku0/ai-sanitizer-rs",
    replacement: path.resolve(__dirname, "packages/ai-sanitizer-rs/src/index.ts"),
  },
  {
    find: "@ku0/anchor-codec-rs",
    replacement: path.resolve(__dirname, "packages/anchor-codec-rs/src/index.ts"),
  },
  {
    find: "@ku0/anchor-relocation-rs",
    replacement: path.resolve(__dirname, "packages/anchor-relocation-rs/src/index.ts"),
  },
  {
    find: "@ku0/app",
    replacement: path.resolve(__dirname, "packages/app/src/index.ts"),
  },
  {
    find: "@ku0/bench",
    replacement: path.resolve(__dirname, "packages/bench/src/index.ts"),
  },
  {
    find: "@ku0/canonicalizer-rs",
    replacement: path.resolve(__dirname, "packages/canonicalizer-rs/src/index.ts"),
  },
  {
    find: "@ku0/compat",
    replacement: path.resolve(__dirname, "packages/compat/src/index.ts"),
  },
  {
    find: "@ku0/conformance-kit",
    replacement: path.resolve(__dirname, "packages/conformance-kit/src/index.ts"),
  },
  {
    find: "@ku0/context-index",
    replacement: path.resolve(__dirname, "packages/context-index/src/index.ts"),
  },
  {
    find: "@ku0/core",
    replacement: path.resolve(__dirname, "packages/core/src/index.ts"),
  },
  {
    find: "@ku0/crypto",
    replacement: path.resolve(__dirname, "packages/crypto/src/index.ts"),
  },
  {
    find: "@ku0/db",
    replacement: path.resolve(__dirname, "packages/db/src/index.ts"),
  },
  {
    find: "@ku0/diff-rs",
    replacement: path.resolve(__dirname, "packages/diff-rs/src/index.ts"),
  },
  {
    find: "@ku0/gitignore-rs",
    replacement: path.resolve(__dirname, "packages/gitignore-rs/src/index.ts"),
  },
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
  {
    find: "@ku0/json-accel-rs",
    replacement: path.resolve(__dirname, "packages/json-accel-rs/src/index.ts"),
  },
  {
    find: "@ku0/lfcc-bridge",
    replacement: path.resolve(__dirname, "packages/lfcc-bridge/src/index.ts"),
  },
  {
    find: "@ku0/model-fabric-rs",
    replacement: path.resolve(__dirname, "packages/model-fabric-rs/src/index.ts"),
  },
  {
    find: "@ku0/native-bindings",
    replacement: path.resolve(__dirname, "packages/native-bindings/src/index.ts"),
  },
  {
    find: "@ku0/overlay",
    replacement: path.resolve(__dirname, "packages/overlay/src/index.ts"),
  },
  {
    find: "@ku0/policy-hash-rs",
    replacement: path.resolve(__dirname, "packages/policy-hash-rs/src/index.ts"),
  },
  {
    find: "@ku0/project-context",
    replacement: path.resolve(__dirname, "packages/project-context/src/index.ts"),
  },
  {
    find: "@ku0/sandbox-rs",
    replacement: path.resolve(__dirname, "packages/sandbox-rs/src/index.ts"),
  },
  {
    find: "@ku0/shared",
    replacement: path.resolve(__dirname, "packages/shared/src/index.ts"),
  },
  {
    find: "@ku0/storage-engine-rs",
    replacement: path.resolve(__dirname, "packages/storage-engine-rs/src/index.ts"),
  },
  {
    find: "@ku0/streaming-markdown-rs",
    replacement: path.resolve(__dirname, "packages/streaming-markdown-rs/src/index.ts"),
  },
  {
    find: "@ku0/workspace-session-rs",
    replacement: path.resolve(__dirname, "packages/workspace-session-rs/src/index.ts"),
  },
  {
    find: "@ku0/symbol-index-rs",
    replacement: path.resolve(__dirname, "packages/symbol-index-rs/src/index.ts"),
  },
  {
    find: "@ku0/text-normalization-rs",
    replacement: path.resolve(__dirname, "packages/text-normalization-rs/src/index.ts"),
  },
  {
    find: "@ku0/token",
    replacement: path.resolve(__dirname, "packages/token/src/index.ts"),
  },
  {
    find: "@ku0/tokenizer-rs",
    replacement: path.resolve(__dirname, "packages/tokenizer-rs/src/index.ts"),
  },
  {
    find: "@ku0/translator",
    replacement: path.resolve(__dirname, "packages/translator/src/index.ts"),
  },
  {
    find: "@ku0/tts",
    replacement: path.resolve(__dirname, "packages/tts/src/index.ts"),
  },
  {
    find: "@ku0/vector-similarity-rs",
    replacement: path.resolve(__dirname, "packages/vector-similarity-rs/src/index.ts"),
  },

  // ============================================
  // App aliases
  // ============================================
  {
    find: "@",
    replacement: path.resolve(__dirname, "apps/reader/src"),
  },
];
