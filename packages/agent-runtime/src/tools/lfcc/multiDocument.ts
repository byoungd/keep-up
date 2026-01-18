import type { CrossDocReference, gateway, ReferenceType } from "@ku0/core";

export type MultiDocumentAtomicity = "all_or_nothing" | "best_effort";
export type MultiDocumentRole = "target" | "source" | "reference";

export type DocFrontierObject = { loro_frontier: string[] };
export type DocFrontierInput = DocFrontierObject | string;

export type MultiDocumentRequestDocument = {
  doc_id: string;
  role: MultiDocumentRole;
  doc_frontier?: DocFrontierInput;
  doc_frontier_tag?: string;
  gateway_request?: gateway.AIGatewayRequest;
  ops_xml?: string;
  preconditions?: Array<{ span_id: string; if_match_context_hash: string }>;
};

export type MultiDocumentReferenceInput = {
  ref_id?: string;
  ref_type: ReferenceType;
  source: CrossDocReference["source"];
  target: CrossDocReference["target"];
};

export type MultiDocumentGatewayRequest = {
  request_id: string;
  agent_id?: string;
  intent_id?: string;
  intent?: unknown;
  atomicity: MultiDocumentAtomicity;
  documents: MultiDocumentRequestDocument[];
  references?: MultiDocumentReferenceInput[];
  policy_context?: gateway.AIGatewayRequest["policy_context"];
};

export type MultiDocumentPolicy = {
  version: "v1";
  enabled: boolean;
  max_documents_per_request: number;
  max_total_ops: number;
  allowed_atomicity: MultiDocumentAtomicity[];
  allow_atomicity_downgrade: boolean;
  max_reference_creations: number;
  require_target_preconditions: boolean;
  require_citation_preconditions: boolean;
};

export type MultiDocumentDocConflict = {
  code: "AI_PRECONDITION_FAILED";
  phase: "ai_gateway";
  retryable: boolean;
  current_frontier?: DocFrontierObject;
  failed_preconditions?: Array<{
    span_id: string;
    reason: string;
    annotation_id?: string;
  }>;
  failed_references?: Array<{ ref_index: number; reason: string }>;
};

export type MultiDocumentDocResult = {
  doc_id: string;
  success: boolean;
  operations_applied: number;
  diagnostics?: gateway.GatewayDiagnostic[];
  conflict?: MultiDocumentDocConflict;
  error?: { status: number; code: string; message: string };
};

export type MultiDocumentGatewaySuccess = {
  status: 200;
  operation_id: string;
  applied_atomicity: MultiDocumentAtomicity;
  applied_frontiers: Record<string, DocFrontierObject>;
  results: MultiDocumentDocResult[];
  created_references: string[];
  diagnostics: gateway.GatewayDiagnostic[];
};

export type MultiDocumentGatewayConflictResponse = {
  status: 409;
  code: "AI_PRECONDITION_FAILED";
  phase: "ai_gateway";
  retryable: true;
  failed_documents: Array<{
    doc_id: string;
    current_frontier?: DocFrontierObject;
    failed_preconditions?: MultiDocumentDocConflict["failed_preconditions"];
    failed_references?: MultiDocumentDocConflict["failed_references"];
  }>;
  diagnostics?: gateway.GatewayDiagnostic[];
};

export type MultiDocumentGatewayError = {
  status: 400 | 401 | 403 | 422 | 500 | 503;
  code: string;
  message: string;
  diagnostics?: gateway.GatewayDiagnostic[];
};

export type MultiDocumentGatewayResponse =
  | MultiDocumentGatewaySuccess
  | MultiDocumentGatewayConflictResponse
  | MultiDocumentGatewayError;

export type NormalizedFrontier = { tag: string; frontier: DocFrontierObject };

type FrontierEntry = { peer: string; counter: number };

function parseFrontierEntry(entry: string): FrontierEntry | null {
  const [peer, counterText] = entry.split(":");
  if (!peer || !counterText) {
    return null;
  }
  const counter = Number.parseInt(counterText, 10);
  if (!Number.isFinite(counter)) {
    return null;
  }
  return { peer, counter };
}

function normalizeFrontierEntries(entries: string[]): FrontierEntry[] | null {
  const parsed: FrontierEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const parsedEntry = parseFrontierEntry(entry);
    if (!parsedEntry) {
      return null;
    }
    if (seen.has(parsedEntry.peer)) {
      return null;
    }
    seen.add(parsedEntry.peer);
    parsed.push(parsedEntry);
  }
  parsed.sort((a, b) => a.peer.localeCompare(b.peer));
  return parsed;
}

function buildFrontierObject(entries: FrontierEntry[]): DocFrontierObject {
  return { loro_frontier: entries.map((entry) => `${entry.peer}:${entry.counter}`) };
}

function buildFrontierTag(entries: FrontierEntry[]): string {
  return entries.map((entry) => `${entry.peer}:${entry.counter}`).join("|");
}

export function normalizeDocFrontierInput(
  input?: DocFrontierInput
): { ok: true; value?: NormalizedFrontier } | { ok: false; error: string } {
  if (input === undefined) {
    return { ok: true };
  }
  if (typeof input === "string") {
    const entries = normalizeFrontierEntries(input.split("|").filter(Boolean));
    if (!entries) {
      return { ok: false, error: "Invalid doc_frontier_tag format" };
    }
    return {
      ok: true,
      value: { tag: buildFrontierTag(entries), frontier: buildFrontierObject(entries) },
    };
  }
  if (!input || typeof input !== "object") {
    return { ok: false, error: "doc_frontier must be a string or {loro_frontier}" };
  }
  const frontier = input as DocFrontierObject;
  if (!Array.isArray(frontier.loro_frontier)) {
    return { ok: false, error: "doc_frontier.loro_frontier must be an array" };
  }
  const entries = normalizeFrontierEntries(frontier.loro_frontier);
  if (!entries) {
    return { ok: false, error: "Invalid doc_frontier entries" };
  }
  return {
    ok: true,
    value: { tag: buildFrontierTag(entries), frontier: buildFrontierObject(entries) },
  };
}

export function countOpsFromXml(xml: string): number {
  const trimmed = xml.trim();
  if (!trimmed) {
    return 0;
  }
  const rootMatch = trimmed.match(/<\s*([a-zA-Z0-9_-]+)/);
  const rootTag = rootMatch?.[1] ?? "";
  if (rootTag === "replace_spans") {
    const matches = trimmed.match(/<\s*span\b[^>]*\bspan_id\s*=\s*["'][^"']+["']/g);
    return matches?.length ?? 1;
  }
  const opMatches = trimmed.match(/<\s*op\b/g);
  return opMatches?.length ?? 1;
}

export function countTargetOps(document: MultiDocumentRequestDocument): number {
  if (document.ops_xml) {
    return countOpsFromXml(document.ops_xml);
  }
  const spanCount = document.gateway_request?.target_spans?.length ?? 0;
  return Math.max(1, spanCount);
}
