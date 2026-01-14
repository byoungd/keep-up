import { buildBlockIndex } from "@/lib/annotations/annotationResolution";
import type { Annotation } from "@/lib/kernel/types";
import type { DirtyInfo, PolicyManifestV09 } from "@ku0/core";
import { DEFAULT_POLICY_MANIFEST } from "@ku0/core";
import type { LoroRuntime } from "@ku0/lfcc-bridge";
import type { EditorView } from "prosemirror-view";

export type DirtyInfoEntry = {
  timestamp: number;
  info: DirtyInfo;
};

export type ReproErrorEntry = {
  timestamp: number;
  code: string;
  message: string;
  stack?: string;
  payload?: unknown;
  source?: string;
};

export type ReproBundle = {
  version: "1.0.0";
  exportedAt: string;
  document: {
    frontiers: unknown;
    versionVector: unknown;
    blockCount: number;
  };
  policy: {
    manifest: PolicyManifestV09;
    negotiated: PolicyManifestV09;
  };
  annotations: Array<{
    id: string;
    start: string;
    end: string;
    spans: Annotation["spans"];
    chain: Annotation["chain"];
    displayState: Annotation["displayState"];
    storedState: Annotation["storedState"];
    verified: boolean;
    color?: Annotation["color"];
  }>;
  dirtyInfo: DirtyInfoEntry[];
  errors: ReproErrorEntry[];
};

export type ReproBundleInput = {
  runtime: LoroRuntime;
  view: EditorView;
  annotations: Annotation[];
  dirtyInfo: DirtyInfoEntry[];
  errors: ReproErrorEntry[];
  policyManifest?: PolicyManifestV09;
  negotiatedPolicy?: PolicyManifestV09;
};

const MAX_STACK_LINES = 6;

function safeJson(value: unknown): unknown {
  try {
    const json = JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
    return JSON.parse(json);
  } catch (_error) {
    return String(value);
  }
}

function sanitizeStack(stack?: string): string | undefined {
  if (!stack) {
    return undefined;
  }
  return stack.split("\n").slice(0, MAX_STACK_LINES).join("\n");
}

export function createReproBundle({
  runtime,
  view,
  annotations,
  dirtyInfo,
  errors,
  policyManifest = DEFAULT_POLICY_MANIFEST,
  negotiatedPolicy = DEFAULT_POLICY_MANIFEST,
}: ReproBundleInput): ReproBundle {
  const blockIndex = buildBlockIndex(view.state);

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    document: {
      frontiers: safeJson(runtime.frontiers),
      versionVector: safeJson(runtime.versionVector),
      blockCount: blockIndex.blockOrder.length,
    },
    policy: {
      manifest: policyManifest,
      negotiated: negotiatedPolicy,
    },
    annotations: annotations.map((annotation) => ({
      id: annotation.id,
      start: annotation.start,
      end: annotation.end,
      spans: annotation.spans,
      chain: annotation.chain,
      displayState: annotation.displayState,
      storedState: annotation.storedState,
      verified: annotation.verified,
      color: annotation.color,
    })),
    dirtyInfo: dirtyInfo.map((entry) => ({
      timestamp: entry.timestamp,
      info: entry.info,
    })),
    errors: errors.map((entry) => ({
      ...entry,
      stack: sanitizeStack(entry.stack),
    })),
  };
}

export function downloadReproBundle(bundle: ReproBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lfcc-repro.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyReproBundleToClipboard(bundle: ReproBundle): Promise<boolean> {
  try {
    const json = JSON.stringify(bundle, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}
