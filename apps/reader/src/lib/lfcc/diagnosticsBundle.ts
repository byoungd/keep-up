import { buildBlockIndex } from "@/lib/annotations/annotationResolution";
import type { Annotation } from "@/lib/kernel/types";
import type { DivergenceSummary } from "@/lib/lfcc/debugStore";
import type { DirtyInfoEntry, ReproErrorEntry } from "@/lib/lfcc/reproBundle";
import type { PolicyManifestV09, SyncClientState } from "@keepup/core";
import { DEFAULT_POLICY_MANIFEST } from "@keepup/core";
import type { LoroRuntime } from "@keepup/lfcc-bridge";
import type { EditorView } from "prosemirror-view";

const MAX_STACK_LINES = 6;
const MAX_OP_ENTRIES = 20;
const MAX_ANNOTATIONS = 50;
const MAX_ERRORS = 20;
const MAX_TEXT_PREVIEW = 120;
const MAX_INLINE_PAYLOAD = 200;

export type TextSummary = {
  size: number;
  hash: string;
  preview: string;
};

export type DiagnosticsSyncSummary = {
  state: SyncClientState;
  error: string | null;
  pendingUpdates: number;
  lastSyncAt: number | null;
  docId?: string;
  clientId?: string | null;
  sessionId?: string | null;
  role?: "viewer" | "editor" | "admin" | null;
  peers: Array<{ clientId: string; displayName: string; color: string; lastSeen?: number }>;
  effectiveManifest?: unknown;
  policyDegradation?: Array<{ field: string; reason: string }>;
  policyDegraded?: boolean;
};

export type DiagnosticsEnvironment = {
  userAgent: string;
  platform?: string;
  language?: string;
  buildHash?: string;
};

export type DiagnosticsBundle = {
  version: "1.0.0";
  exportedAt: string;
  protocol: {
    lfccVersion: string;
    policyId: string;
  };
  document: {
    frontiers: unknown;
    versionVector: unknown;
    blockCount: number | null;
  };
  policy: {
    manifest: PolicyManifestV09;
    effective?: unknown;
    degraded: boolean;
    degradationSteps: Array<{ field: string; reason: string }>;
  };
  sync: DiagnosticsSyncSummary | null;
  annotations: Array<{
    id: string;
    displayState: string;
    verified: boolean;
    spanCount: number;
    chainPolicy?: string;
    content?: string;
    contentSummary?: TextSummary;
  }>;
  ops: Array<{
    timestamp: number;
    opCodes: string[];
    touchedBlocks: number;
    touchedRanges: number;
    txnIndex?: number;
  }>;
  divergence: DivergenceSummary | null;
  structuralConflicts: Array<{
    timestamp: number;
    opA: { opCode: string; blockId: string; source: string };
    opB: { opCode: string; blockId: string; source: string };
    resolution: "a_wins" | "b_wins" | "dropped";
    reason: string;
  }>;
  errors: Array<{
    timestamp: number;
    code: string;
    message: string;
    stack?: string;
    source?: string;
    payload?: unknown;
    payloadSummary?: TextSummary;
  }>;
  environment: DiagnosticsEnvironment;
  limits: {
    maxOps: number;
    maxAnnotations: number;
    maxErrors: number;
    maxTextPreview: number;
    maxInlinePayload: number;
  };
};

export type StructuralConflictEntry = {
  timestamp: number;
  opA: { opCode: string; blockId: string; source: string };
  opB: { opCode: string; blockId: string; source: string };
  resolution: "a_wins" | "b_wins" | "dropped";
  reason: string;
};

export type DiagnosticsBundleInput = {
  runtime: LoroRuntime;
  view?: EditorView;
  annotations: Annotation[];
  dirtyInfo: DirtyInfoEntry[];
  errors: ReproErrorEntry[];
  syncSummary?: DiagnosticsSyncSummary;
  divergence?: DivergenceSummary | null;
  policyManifest?: PolicyManifestV09;
  includeContent?: boolean;
  environment?: DiagnosticsEnvironment;
  structuralConflicts?: StructuralConflictEntry[];
};

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

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function summarizeText(value: string): TextSummary {
  const preview =
    value.length > MAX_TEXT_PREVIEW ? `${value.slice(0, MAX_TEXT_PREVIEW)}...` : value;
  return {
    size: value.length,
    hash: hashString(value),
    preview,
  };
}

function resolveEnvironment(override?: DiagnosticsEnvironment): DiagnosticsEnvironment {
  if (override) {
    return override;
  }
  const userAgent =
    typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "unknown";
  const platform =
    typeof navigator !== "undefined" && navigator.platform ? navigator.platform : undefined;
  const language =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
  const buildHash =
    process.env.NEXT_PUBLIC_BUILD_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA;
  return { userAgent, platform, language, buildHash };
}

function serializePayload(
  payload: unknown,
  includeContent: boolean
): { payload?: unknown; payloadSummary?: TextSummary } {
  if (payload == null) {
    return {};
  }
  const json = safeJson(payload);
  if (includeContent) {
    return { payload: json };
  }
  const serialized = JSON.stringify(json);
  if (serialized.length <= MAX_INLINE_PAYLOAD) {
    return { payload: json };
  }
  return { payloadSummary: summarizeText(serialized) };
}

export function createDiagnosticsBundle({
  runtime,
  view,
  annotations,
  dirtyInfo,
  errors,
  syncSummary,
  divergence = null,
  policyManifest = DEFAULT_POLICY_MANIFEST,
  includeContent = false,
  environment,
  structuralConflicts = [],
}: DiagnosticsBundleInput): DiagnosticsBundle {
  const blockCount = view ? buildBlockIndex(view.state).blockOrder.length : null;
  const sortedAnnotations = [...annotations].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    protocol: {
      lfccVersion: policyManifest.lfcc_version,
      policyId: policyManifest.policy_id,
    },
    document: {
      frontiers: safeJson(runtime.frontiers),
      versionVector: safeJson(runtime.versionVector),
      blockCount,
    },
    policy: {
      manifest: policyManifest,
      effective: syncSummary?.effectiveManifest,
      degraded: syncSummary?.policyDegraded ?? false,
      degradationSteps: syncSummary?.policyDegradation ?? [],
    },
    sync: syncSummary ?? null,
    annotations: sortedAnnotations.slice(0, MAX_ANNOTATIONS).map((annotation) => {
      const contentSummary = summarizeText(annotation.content);
      return {
        id: annotation.id,
        displayState: annotation.displayState,
        verified: annotation.verified,
        spanCount: annotation.spans?.length ?? 0,
        chainPolicy: annotation.chain?.policy?.kind,
        content: includeContent ? annotation.content : undefined,
        contentSummary: includeContent ? undefined : contentSummary,
      };
    }),
    ops: dirtyInfo.slice(-MAX_OP_ENTRIES).map((entry) => ({
      timestamp: entry.timestamp,
      opCodes: entry.info.opCodes,
      touchedBlocks: entry.info.touchedBlocks.length,
      touchedRanges: entry.info.touchedRanges?.length ?? 0,
      txnIndex: entry.info.txnIndex,
    })),
    divergence,
    structuralConflicts,
    errors: errors.slice(-MAX_ERRORS).map((entry) => {
      const serialized = serializePayload(entry.payload, includeContent);
      return {
        timestamp: entry.timestamp,
        code: entry.code,
        message: entry.message,
        stack: sanitizeStack(entry.stack),
        source: entry.source,
        payload: serialized.payload,
        payloadSummary: serialized.payloadSummary,
      };
    }),
    environment: resolveEnvironment(environment),
    limits: {
      maxOps: MAX_OP_ENTRIES,
      maxAnnotations: MAX_ANNOTATIONS,
      maxErrors: MAX_ERRORS,
      maxTextPreview: MAX_TEXT_PREVIEW,
      maxInlinePayload: MAX_INLINE_PAYLOAD,
    },
  };
}

export async function copyDiagnosticsBundleToClipboard(
  bundle: DiagnosticsBundle
): Promise<boolean> {
  try {
    const json = JSON.stringify(bundle, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}
