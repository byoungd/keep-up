/**
 * LFCC Tool Server
 *
 * Provides document operations through the LFCC (Local-First Collaboration Contract).
 * This bridges the agent runtime with the document editing system.
 *
 * Design: Uses dependency injection for the LFCC bridge to maintain loose coupling.
 */

import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { getLogger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  AIEnvelopeDiagnostic,
  AIEnvelopeResponse,
  AIRequestEnvelope,
  ContentChunk,
  CrossDocReferenceRecord,
  DataAccessPolicy,
  EditIntent,
  ReferenceStore,
} from "@ku0/core";
import {
  applyDataAccessPolicyToChunks,
  documentId,
  gateway,
  is409Conflict as isEnvelopeConflict,
  isSuccessResponse as isEnvelopeSuccess,
  isUnprocessableResponse as isEnvelopeUnprocessable,
  normalizeAIRequestEnvelope,
  stableStringify,
} from "@ku0/core";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import type {
  DocFrontierObject,
  MultiDocumentAtomicity,
  MultiDocumentDocConflict,
  MultiDocumentDocResult,
  MultiDocumentGatewayError,
  MultiDocumentGatewayRequest,
  MultiDocumentGatewayResponse,
  MultiDocumentPolicy,
  MultiDocumentReferenceInput,
  MultiDocumentRole,
  NormalizedFrontier,
} from "./multiDocument";
import { countTargetOps, normalizeDocFrontierInput } from "./multiDocument";

export type {
  DocFrontierObject,
  MultiDocumentGatewayRequest,
  MultiDocumentGatewayResponse,
  MultiDocumentPolicy,
  MultiDocumentRequestDocument,
  MultiDocumentRole,
} from "./multiDocument";

const logger = getLogger("lfcc-tool");
const BLOCK_TYPES: BlockType[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bullet_list",
  "numbered_list",
  "quote",
  "code",
  "divider",
];
const BLOCK_TYPE_SET = new Set<BlockType>(BLOCK_TYPES);
const LIST_SORT_FIELDS = new Set<NonNullable<ListDocumentsOptions["sortBy"]>>([
  "title",
  "updatedAt",
  "createdAt",
]);

// ============================================================================
// LFCC Bridge Interface (dependency injection)
// ============================================================================

/**
 * Interface for LFCC bridge operations.
 * Implement this to connect to your actual LFCC implementation.
 */
export interface ILFCCBridge {
  // Document operations
  getDocument(docId: string): Promise<LFCCDocument | null>;
  listDocuments(options?: ListDocumentsOptions): Promise<LFCCDocumentMeta[]>;
  createDocument(title: string, content?: string): Promise<LFCCDocument>;

  // Content operations
  getContent(docId: string): Promise<string>;
  getBlocks(docId: string): Promise<LFCCBlock[]>;
  getBlock(docId: string, blockId: string): Promise<LFCCBlock | null>;

  // Editing operations (returns operation for CRDT)
  insertBlock(
    docId: string,
    afterBlockId: string | null,
    content: string,
    type?: BlockType
  ): Promise<LFCCOperation>;
  updateBlock(docId: string, blockId: string, content: string): Promise<LFCCOperation>;
  deleteBlock(docId: string, blockId: string): Promise<LFCCOperation>;
  moveBlock(docId: string, blockId: string, afterBlockId: string | null): Promise<LFCCOperation>;

  // Search
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Apply operations (commit to CRDT)
  applyOperations(docId: string, operations: LFCCOperation[]): Promise<void>;
}

// ============================================================================
// LFCC Types
// ============================================================================

export interface LFCCDocument {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  blockCount: number;
  wordCount: number;
}

export interface LFCCDocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface LFCCBlock {
  id: string;
  type: BlockType;
  content: string;
  children?: LFCCBlock[];
  attributes?: Record<string, unknown>;
}

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet_list"
  | "numbered_list"
  | "quote"
  | "code"
  | "divider";

export interface LFCCOperation {
  type: "insert" | "update" | "delete" | "move";
  blockId?: string;
  content?: string;
  position?: { afterBlockId: string | null };
  blockType?: BlockType;
  timestamp: number;
}

export interface ListDocumentsOptions {
  limit?: number;
  offset?: number;
  sortBy?: "title" | "updatedAt" | "createdAt";
  order?: "asc" | "desc";
}

export interface SearchOptions {
  docIds?: string[];
  limit?: number;
  semantic?: boolean;
}

export interface SearchResult {
  docId: string;
  docTitle: string;
  blockId: string;
  content: string;
  score: number;
  highlights?: string[];
}

export type AIEnvelopeGateway = {
  processRequest: (request: AIRequestEnvelope) => Promise<AIEnvelopeResponse>;
};

export type LFCCToolServerOptions = {
  bridge?: ILFCCBridge;
  aiGateway?: gateway.AIGateway;
  aiGatewayResolver?: (docId: string) => gateway.AIGateway | undefined;
  aiEnvelopeGateway?: AIEnvelopeGateway;
  aiEnvelopeGatewayResolver?: (docId: string) => AIEnvelopeGateway | undefined;
  rebaseProvider?: gateway.RebaseProvider;
  relocationProvider?: gateway.RelocationProvider;
  retryPolicy?: gateway.RetryPolicy;
  multiDocumentPolicy?: MultiDocumentPolicy;
  policyDomainResolver?: (docId: string) => string | null;
  referenceStore?: ReferenceStore;
  referenceStoreResolver?: (policyDomainId: string) => ReferenceStore | undefined;
  multiDocIdempotencyWindowMs?: number;
};

type LFCCToolServerInit = ILFCCBridge | LFCCToolServerOptions;

type AIGatewayRetryOptions = {
  enabled?: boolean;
  policy?: gateway.RetryPolicy;
  originalTexts?: Record<string, string>;
};

type AIGatewayToolPayload = {
  request: gateway.AIGatewayRequest;
  retry?: AIGatewayRetryOptions;
};

const DEFAULT_MULTI_DOC_IDEMPOTENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isBridgeCandidate(input: LFCCToolServerInit | undefined): input is ILFCCBridge {
  if (!input || typeof input !== "object") {
    return false;
  }
  return "getDocument" in input && typeof (input as ILFCCBridge).getDocument === "function";
}

function resolveLFCCToolServerOptions(
  input: LFCCToolServerInit | undefined
): LFCCToolServerOptions {
  if (!input) {
    return {};
  }
  if (isBridgeCandidate(input)) {
    return { bridge: input };
  }
  return input;
}

function normalizeOriginalTexts(value: unknown): Map<string, string> {
  if (!value || typeof value !== "object") {
    return new Map();
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result = new Map<string, string>();
  for (const [spanId, text] of entries) {
    if (typeof text === "string") {
      result.set(spanId, text);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreconditionReason(reason: gateway.ConflictReason): string {
  if (reason === "unverified_target") {
    return "unverified";
  }
  return reason;
}

function resolveFrontierFromTag(tag?: string): DocFrontierObject | undefined {
  if (!tag) {
    return undefined;
  }
  const normalized = normalizeDocFrontierInput(tag);
  if (!normalized.ok || !normalized.value) {
    return undefined;
  }
  return normalized.value.frontier;
}

function buildPerDocRequestId(requestId: string, docId: string): string {
  return `${requestId}:${docId}`;
}

type NormalizedPrecondition = { span_id: string; if_match_context_hash: string };

type NormalizedMultiDocDocument = {
  doc_id: string;
  role: MultiDocumentRole;
  frontierTag: string;
  frontier: DocFrontierObject;
  gateway_request?: gateway.AIGatewayRequest;
  ops_xml?: string;
  preconditions?: NormalizedPrecondition[];
};

type MultiDocTargetOutcome = {
  docResult: MultiDocumentDocResult;
  frontier?: DocFrontierObject;
};

type MultiDocTargetAccumulator = {
  results: MultiDocumentDocResult[];
  appliedFrontiers: Record<string, DocFrontierObject>;
  conflicts: MultiDocumentDocResult[];
  errors: MultiDocumentDocResult[];
};

type ToolResultOr<T> = { ok: true; value: T } | { ok: false; error: MCPToolResult };

function isAnchorInput(value: unknown): value is {
  anchor: string;
  bias: "left" | "right";
} {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.anchor === "string" && (value.bias === "left" || value.bias === "right");
}

function isReferenceInput(value: unknown): value is {
  ref_type: string;
  source: {
    doc_id: string;
    block_id: string;
    start: { anchor: string; bias: "left" | "right" };
    end: { anchor: string; bias: "left" | "right" };
    if_match_context_hash?: string;
  };
  target: {
    doc_id: string;
    block_id: string;
    anchor: { anchor: string; bias: "left" | "right" };
  };
} {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.ref_type !== "string") {
    return false;
  }
  if (!isRecord(value.source) || !isRecord(value.target)) {
    return false;
  }
  if (typeof value.source.doc_id !== "string" || typeof value.source.block_id !== "string") {
    return false;
  }
  if (typeof value.target.doc_id !== "string" || typeof value.target.block_id !== "string") {
    return false;
  }
  if (!isAnchorInput(value.source.start) || !isAnchorInput(value.source.end)) {
    return false;
  }
  if (!isAnchorInput(value.target.anchor)) {
    return false;
  }
  if (
    value.source.if_match_context_hash !== undefined &&
    typeof value.source.if_match_context_hash !== "string"
  ) {
    return false;
  }
  return true;
}

function normalizeDocId(
  doc: Record<string, unknown>,
  seenDocIds: Set<string>
): { ok: true; docId: string } | { ok: false; error: string } {
  const docId = doc.doc_id;
  if (typeof docId !== "string" || docId.trim().length === 0) {
    return { ok: false, error: "Document doc_id must be a non-empty string" };
  }
  if (seenDocIds.has(docId)) {
    return { ok: false, error: `Duplicate doc_id in documents: ${docId}` };
  }
  seenDocIds.add(docId);
  return { ok: true, docId };
}

function normalizeDocRole(
  doc: Record<string, unknown>,
  docId: string
): { ok: true; role: MultiDocumentRole } | { ok: false; error: string } {
  const role = doc.role;
  if (role !== "target" && role !== "source" && role !== "reference") {
    return { ok: false, error: `Invalid document role for ${docId}` };
  }
  return { ok: true, role };
}

function normalizeGatewayRequestInput(
  doc: Record<string, unknown>
): gateway.AIGatewayRequest | undefined {
  return isRecord(doc.gateway_request)
    ? (doc.gateway_request as gateway.AIGatewayRequest)
    : undefined;
}

function normalizePreconditionsInput(
  value: unknown,
  docId: string
): { ok: true; preconditions: NormalizedPrecondition[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, preconditions: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: `preconditions must be an array for ${docId}` };
  }
  const preconditions: NormalizedPrecondition[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      return { ok: false, error: `preconditions[${index}] must be an object for ${docId}` };
    }
    const spanId = entry.span_id;
    const contextHash = entry.if_match_context_hash;
    if (typeof spanId !== "string" || spanId.trim().length === 0) {
      return {
        ok: false,
        error: `preconditions[${index}].span_id must be a non-empty string for ${docId}`,
      };
    }
    if (typeof contextHash !== "string" || contextHash.trim().length === 0) {
      return {
        ok: false,
        error: `preconditions[${index}].if_match_context_hash must be a non-empty string for ${docId}`,
      };
    }
    preconditions.push({ span_id: spanId, if_match_context_hash: contextHash });
  }
  return { ok: true, preconditions };
}

function normalizeOpsXmlInput(
  doc: Record<string, unknown>,
  docId: string
): { ok: true; opsXml?: string } | { ok: false; error: string } {
  if (doc.ops_xml !== undefined && typeof doc.ops_xml !== "string") {
    return { ok: false, error: `ops_xml must be a string for ${docId}` };
  }
  const opsXml = typeof doc.ops_xml === "string" ? doc.ops_xml : undefined;
  return { ok: true, opsXml };
}

function validateMultiDocRoleConstraints(input: {
  role: MultiDocumentRole;
  docId: string;
  gatewayRequestInput?: gateway.AIGatewayRequest;
  opsXml?: string;
  preconditions: NormalizedPrecondition[];
}): string | undefined {
  const { role, docId, gatewayRequestInput, opsXml, preconditions } = input;
  if (role !== "target") {
    if (gatewayRequestInput) {
      return `gateway_request is only allowed for target documents (${docId})`;
    }
    if (opsXml) {
      return `ops_xml is only allowed for target documents (${docId})`;
    }
    if (preconditions.length > 0) {
      return `preconditions are only allowed for target documents (${docId})`;
    }
    return undefined;
  }

  const hasGatewayRequest = Boolean(gatewayRequestInput);
  const hasOpsXml = Boolean(opsXml);
  if (hasGatewayRequest && hasOpsXml) {
    return `Target document ${docId} cannot include both gateway_request and ops_xml`;
  }
  if (!hasGatewayRequest && !hasOpsXml) {
    return `Target document ${docId} must include gateway_request or ops_xml`;
  }
  if (hasGatewayRequest && preconditions.length > 0) {
    return `preconditions are only allowed with ops_xml targets (${docId})`;
  }
  if (hasOpsXml && opsXml?.trim().length === 0) {
    return `ops_xml must be non-empty for target document ${docId}`;
  }
  return undefined;
}

function normalizeDocumentFrontier(
  doc: Record<string, unknown>,
  gatewayRequestInput: gateway.AIGatewayRequest | undefined,
  docId: string
): { ok: true; frontier: NormalizedFrontier } | { ok: false; error: string } {
  const frontierInput =
    (doc.doc_frontier as unknown) ??
    doc.doc_frontier_tag ??
    gatewayRequestInput?.doc_frontier ??
    gatewayRequestInput?.doc_frontier_tag;
  // biome-ignore lint/suspicious/noExplicitAny: frontierInput type is loose
  const normalizedFrontier = normalizeDocFrontierInput(frontierInput as any);
  if (!normalizedFrontier.ok || !normalizedFrontier.value) {
    return { ok: false, error: `Invalid doc_frontier for ${docId}` };
  }
  return { ok: true, frontier: normalizedFrontier.value };
}

function normalizeTargetGatewayRequest(
  docId: string,
  gatewayRequestInput: gateway.AIGatewayRequest | undefined,
  frontier: NormalizedFrontier,
  request: MultiDocumentGatewayRequest
): { ok: true; request: gateway.AIGatewayRequest } | { ok: false; error: string } {
  if (!gatewayRequestInput) {
    return { ok: false, error: `Target document ${docId} is missing gateway_request` };
  }

  if (gatewayRequestInput.doc_id && gatewayRequestInput.doc_id !== docId) {
    return { ok: false, error: `gateway_request doc_id mismatch for ${docId}` };
  }

  const requestFrontierInput =
    gatewayRequestInput.doc_frontier ?? gatewayRequestInput.doc_frontier_tag;
  if (requestFrontierInput !== undefined) {
    const normalizedRequestFrontier = normalizeDocFrontierInput(requestFrontierInput);
    if (!normalizedRequestFrontier.ok || !normalizedRequestFrontier.value) {
      return { ok: false, error: `Invalid gateway_request frontier for ${docId}` };
    }
    if (normalizedRequestFrontier.value.tag !== frontier.tag) {
      return {
        ok: false,
        error: `gateway_request frontier does not match document frontier for ${docId}`,
      };
    }
  }

  const hydratedRequest: gateway.AIGatewayRequest = {
    ...gatewayRequestInput,
    doc_id: docId,
    doc_frontier_tag: frontier.tag,
    doc_frontier: frontier.tag,
    agent_id: gatewayRequestInput.agent_id ?? request.agent_id,
    intent_id: gatewayRequestInput.intent_id ?? request.intent_id,
    intent: gatewayRequestInput.intent ?? request.intent,
    policy_context: gatewayRequestInput.policy_context ?? request.policy_context,
  };

  const parsed = gateway.parseGatewayRequest(hydratedRequest);
  if (!parsed) {
    return { ok: false, error: `gateway_request is invalid for ${docId}` };
  }
  return { ok: true, request: parsed };
}

function normalizeMultiDocDocumentEntry(
  doc: unknown,
  request: MultiDocumentGatewayRequest,
  seenDocIds: Set<string>
): { ok: true; document: NormalizedMultiDocDocument } | { ok: false; error: string } {
  if (!isRecord(doc)) {
    return { ok: false, error: "Each document entry must be an object" };
  }

  const docIdResult = normalizeDocId(doc, seenDocIds);
  if (!docIdResult.ok) {
    return docIdResult;
  }
  const docId = docIdResult.docId;

  const roleResult = normalizeDocRole(doc, docId);
  if (!roleResult.ok) {
    return roleResult;
  }

  const gatewayRequestInput = normalizeGatewayRequestInput(doc);

  const preconditionsResult = normalizePreconditionsInput(doc.preconditions, docId);
  if (!preconditionsResult.ok) {
    return { ok: false, error: preconditionsResult.error };
  }

  const opsXmlResult = normalizeOpsXmlInput(doc, docId);
  if (!opsXmlResult.ok) {
    return { ok: false, error: opsXmlResult.error };
  }
  const opsXml = opsXmlResult.opsXml;

  const roleConstraintError = validateMultiDocRoleConstraints({
    role: roleResult.role,
    docId,
    gatewayRequestInput,
    opsXml,
    preconditions: preconditionsResult.preconditions,
  });
  if (roleConstraintError) {
    return { ok: false, error: roleConstraintError };
  }

  const frontierResult = normalizeDocumentFrontier(doc, gatewayRequestInput, docId);
  if (!frontierResult.ok) {
    return frontierResult;
  }

  let gatewayRequest: gateway.AIGatewayRequest | undefined;
  if (roleResult.role === "target" && gatewayRequestInput) {
    const normalizedRequest = normalizeTargetGatewayRequest(
      docId,
      gatewayRequestInput,
      frontierResult.frontier,
      request
    );
    if (!normalizedRequest.ok) {
      return { ok: false, error: normalizedRequest.error };
    }
    gatewayRequest = normalizedRequest.request;
  }

  return {
    ok: true,
    document: {
      doc_id: docId,
      role: roleResult.role,
      frontierTag: frontierResult.frontier.tag,
      frontier: frontierResult.frontier.frontier,
      gateway_request: gatewayRequest,
      ops_xml: opsXml,
      preconditions:
        roleResult.role === "target" && opsXml ? preconditionsResult.preconditions : undefined,
    },
  };
}

function normalizeMultiDocDocuments(
  request: MultiDocumentGatewayRequest
): { ok: true; documents: NormalizedMultiDocDocument[] } | { ok: false; error: string } {
  const documents: NormalizedMultiDocDocument[] = [];
  const seenDocIds = new Set<string>();

  for (const doc of request.documents) {
    const normalized = normalizeMultiDocDocumentEntry(doc, request, seenDocIds);
    if (!normalized.ok) {
      return { ok: false, error: normalized.error };
    }
    documents.push(normalized.document);
  }

  return { ok: true, documents };
}

function mapGatewayResult(
  docId: string,
  result: gateway.AIGatewayResult
): { docResult: MultiDocumentDocResult; frontier?: DocFrontierObject } {
  if (gateway.isGatewaySuccess(result)) {
    const frontierTag = result.server_doc_frontier ?? result.server_frontier_tag;
    return {
      docResult: {
        doc_id: docId,
        success: true,
        operations_applied: result.apply_plan?.operations.length ?? 0,
        diagnostics: result.diagnostics,
      },
      frontier: resolveFrontierFromTag(frontierTag),
    };
  }

  if (gateway.isGateway409(result)) {
    const frontierTag = result.server_doc_frontier ?? result.server_frontier_tag;
    return {
      docResult: {
        doc_id: docId,
        success: false,
        operations_applied: 0,
        conflict: {
          code: "AI_PRECONDITION_FAILED",
          phase: "ai_gateway",
          retryable: true,
          current_frontier: resolveFrontierFromTag(frontierTag),
          failed_preconditions: result.failed_preconditions.map((pre) => ({
            span_id: pre.span_id,
            reason: normalizePreconditionReason(pre.reason),
            annotation_id: pre.annotation_id,
          })),
        },
      },
      frontier: resolveFrontierFromTag(frontierTag),
    };
  }

  return {
    docResult: {
      doc_id: docId,
      success: false,
      operations_applied: 0,
      error: {
        status: result.status,
        code: result.code,
        message: result.message,
      },
    },
  };
}

function mapEnvelopeDiagnostics(
  result: AIEnvelopeResponse
): gateway.GatewayDiagnostic[] | undefined {
  if (!("diagnostics" in result) || !Array.isArray(result.diagnostics)) {
    return undefined;
  }
  const diagnostics: gateway.GatewayDiagnostic[] = [];
  for (const entry of result.diagnostics) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const diag = entry as AIEnvelopeDiagnostic;
    if (typeof diag.kind !== "string" || typeof diag.detail !== "string") {
      continue;
    }
    const severity =
      diag.severity === "warning" || diag.severity === "error" ? diag.severity : "info";
    diagnostics.push({
      severity,
      kind: diag.kind,
      detail: diag.detail,
    });
  }
  return diagnostics.length > 0 ? diagnostics : undefined;
}

function mapEnvelopeResult(
  document: NormalizedMultiDocDocument,
  result: AIEnvelopeResponse
): { docResult: MultiDocumentDocResult; frontier?: DocFrontierObject } {
  const diagnostics = mapEnvelopeDiagnostics(result);
  const fallbackFrontier = resolveFrontierFromTag(document.frontierTag);
  const operationsApplied = countTargetOps({
    doc_id: document.doc_id,
    role: document.role,
    gateway_request: document.gateway_request,
    ops_xml: document.ops_xml,
  });

  if (isEnvelopeSuccess(result)) {
    const frontier = resolveFrontierFromTag(result.applied_frontier ?? document.frontierTag);
    return {
      docResult: {
        doc_id: document.doc_id,
        success: true,
        operations_applied: operationsApplied,
        diagnostics,
      },
      frontier: frontier ?? fallbackFrontier,
    };
  }

  if (isEnvelopeConflict(result)) {
    const frontier = resolveFrontierFromTag(result.current_frontier ?? document.frontierTag);
    return {
      docResult: {
        doc_id: document.doc_id,
        success: false,
        operations_applied: 0,
        diagnostics,
        conflict: {
          code: "AI_PRECONDITION_FAILED",
          phase: "ai_gateway",
          retryable: true,
          current_frontier: frontier ?? fallbackFrontier,
          failed_preconditions: result.failed_preconditions.map((pre) => ({
            span_id: pre.span_id,
            reason: pre.reason,
          })),
        },
      },
      frontier: frontier ?? fallbackFrontier,
    };
  }

  if (isEnvelopeUnprocessable(result)) {
    return {
      docResult: {
        doc_id: document.doc_id,
        success: false,
        operations_applied: 0,
        diagnostics,
        error: {
          status: 422,
          code: result.code,
          message: "AI envelope rejected",
        },
      },
      frontier: fallbackFrontier,
    };
  }

  return {
    docResult: {
      doc_id: document.doc_id,
      success: false,
      operations_applied: 0,
      diagnostics,
      error: {
        status: result.status,
        code: result.code,
        message: result.message,
      },
    },
    frontier: fallbackFrontier,
  };
}

type ReferenceFailure = { ref_index: number; reason: string };

type ReferenceCreationResult =
  | {
      ok: true;
      createdReferences: string[];
      failedReferences: Map<string, ReferenceFailure[]>;
    }
  | { ok: false; response: MultiDocumentGatewayResponse };

type ReferenceProcessResult =
  | { ok: true; createdReferences: string[] }
  | { ok: false; response: MultiDocumentGatewayResponse };

type FailedReferenceDocument = {
  doc_id: string;
  current_frontier?: DocFrontierObject;
  failed_references: ReferenceFailure[];
};

type PreparedMultiDocRequest = {
  request: MultiDocumentGatewayRequest;
  documents: NormalizedMultiDocDocument[];
  targetDocuments: NormalizedMultiDocDocument[];
  references: MultiDocumentReferenceInput[];
  appliedAtomicity: MultiDocumentAtomicity;
  diagnostics: gateway.GatewayDiagnostic[];
  policyDomainId: string | undefined;
};

function parseMultiDocRequestPayload(
  args: Record<string, unknown>
): ToolResultOr<MultiDocumentGatewayRequest> {
  const payload = args as { request?: unknown };
  if (!isRecord(payload.request)) {
    return { ok: false, error: errorResult("INVALID_ARGUMENTS", "request must be an object") };
  }
  return { ok: true, value: payload.request as MultiDocumentGatewayRequest };
}

function ensureMultiDocPolicyEnabled(
  policy: MultiDocumentPolicy | undefined
): ToolResultOr<MultiDocumentPolicy> {
  if (!policy || !policy.enabled) {
    const response: MultiDocumentGatewayResponse = {
      status: 400,
      code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
      message: "Multi-document gateway is not configured",
    };
    return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
  }
  return { ok: true, value: policy };
}

function validateMultiDocRequestBasics(request: MultiDocumentGatewayRequest): ToolResultOr<void> {
  if (!Array.isArray(request.documents) || request.documents.length === 0) {
    return {
      ok: false,
      error: errorResult("INVALID_ARGUMENTS", "documents must be a non-empty array"),
    };
  }

  if (typeof request.request_id !== "string" || request.request_id.trim().length === 0) {
    return {
      ok: false,
      error: errorResult("INVALID_ARGUMENTS", "request_id must be a non-empty string"),
    };
  }

  if (typeof request.agent_id !== "string" || request.agent_id.trim().length === 0) {
    return {
      ok: false,
      error: errorResult("INVALID_ARGUMENTS", "agent_id must be a non-empty string"),
    };
  }

  const hasIntentId = typeof request.intent_id === "string" && request.intent_id.trim().length > 0;
  const hasIntent =
    isRecord(request.intent) &&
    typeof request.intent.id === "string" &&
    request.intent.id.trim().length > 0;
  if (!hasIntentId && !hasIntent) {
    return { ok: false, error: errorResult("INVALID_ARGUMENTS", "Missing intent_id or intent") };
  }

  if (request.atomicity !== "all_or_nothing" && request.atomicity !== "best_effort") {
    return {
      ok: false,
      error: errorResult("INVALID_ARGUMENTS", "atomicity must be all_or_nothing or best_effort"),
    };
  }

  return { ok: true, value: undefined };
}

function validateMultiDocDocumentsLimit(
  documents: NormalizedMultiDocDocument[],
  policy: MultiDocumentPolicy
): ToolResultOr<void> {
  if (documents.length > policy.max_documents_per_request) {
    const response: MultiDocumentGatewayResponse = {
      status: 400,
      code: "AI_MULTI_DOCUMENT_LIMIT_EXCEEDED",
      message: "Request exceeds max_documents_per_request",
    };
    return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
  }
  return { ok: true, value: undefined };
}

function getTargetPreconditionCount(document: NormalizedMultiDocDocument): number {
  if (document.gateway_request) {
    return document.gateway_request.target_spans.length;
  }
  return document.preconditions?.length ?? 0;
}

function resolveTargetDocuments(
  documents: NormalizedMultiDocDocument[],
  policy: MultiDocumentPolicy
): ToolResultOr<NormalizedMultiDocDocument[]> {
  const targetDocuments = documents
    .filter((doc) => doc.role === "target")
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id));
  if (targetDocuments.length === 0) {
    return {
      ok: false,
      error: errorResult("INVALID_ARGUMENTS", "At least one target document is required"),
    };
  }

  if (policy.require_target_preconditions) {
    const missingPreconditions = targetDocuments.filter(
      (doc) => getTargetPreconditionCount(doc) === 0
    );
    if (missingPreconditions.length > 0) {
      return {
        ok: false,
        error: errorResult(
          "INVALID_ARGUMENTS",
          `Target documents missing preconditions: ${missingPreconditions
            .map((doc) => doc.doc_id)
            .join(", ")}`
        ),
      };
    }
  }

  return { ok: true, value: targetDocuments };
}

function validateTotalOps(
  targetDocuments: NormalizedMultiDocDocument[],
  policy: MultiDocumentPolicy
): ToolResultOr<void> {
  const totalOps = targetDocuments.reduce((sum, doc) => {
    return (
      sum +
      countTargetOps({
        doc_id: doc.doc_id,
        role: doc.role,
        gateway_request: doc.gateway_request,
        ops_xml: doc.ops_xml,
      })
    );
  }, 0);
  if (totalOps > policy.max_total_ops) {
    const response: MultiDocumentGatewayResponse = {
      status: 400,
      code: "AI_MULTI_DOCUMENT_LIMIT_EXCEEDED",
      message: "Request exceeds max_total_ops",
    };
    return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
  }
  return { ok: true, value: undefined };
}

function resolveReferences(
  request: MultiDocumentGatewayRequest,
  documents: NormalizedMultiDocDocument[],
  policy: MultiDocumentPolicy
): ToolResultOr<MultiDocumentReferenceInput[]> {
  const references = Array.isArray(request.references) ? request.references : [];
  const invalidReferenceEntry = references.find((ref) => !isReferenceInput(ref));
  if (invalidReferenceEntry) {
    return {
      ok: false,
      error: errorResult(
        "INVALID_ARGUMENTS",
        "references must include ref_type, source, and target anchors"
      ),
    };
  }
  if (references.length > policy.max_reference_creations) {
    const response: MultiDocumentGatewayResponse = {
      status: 400,
      code: "AI_MULTI_DOCUMENT_LIMIT_EXCEEDED",
      message: "Request exceeds max_reference_creations",
    };
    return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
  }

  if (policy.require_citation_preconditions) {
    const missingCitation = references.find(
      (ref) => ref.ref_type === "citation" && !ref.source.if_match_context_hash
    );
    if (missingCitation) {
      return {
        ok: false,
        error: errorResult(
          "INVALID_ARGUMENTS",
          "Citation references require source.if_match_context_hash"
        ),
      };
    }
  }

  const docIdSet = new Set(documents.map((doc) => doc.doc_id));
  const invalidReference = references.find(
    (ref) => !docIdSet.has(ref.source.doc_id) || !docIdSet.has(ref.target.doc_id)
  );
  if (invalidReference) {
    const response: MultiDocumentGatewayResponse = {
      status: 400,
      code: "AI_REFERENCE_INVALID",
      message: "Reference source/target must be included in documents[]",
    };
    return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
  }

  return { ok: true, value: references };
}

function resolveAtomicity(
  policy: MultiDocumentPolicy,
  requestedAtomicity: MultiDocumentAtomicity
): ToolResultOr<{
  appliedAtomicity: MultiDocumentAtomicity;
  diagnostics: gateway.GatewayDiagnostic[];
}> {
  const diagnostics: gateway.GatewayDiagnostic[] = [];
  let appliedAtomicity = requestedAtomicity;
  if (!policy.allowed_atomicity.includes(appliedAtomicity)) {
    if (policy.allow_atomicity_downgrade && policy.allowed_atomicity.includes("best_effort")) {
      appliedAtomicity = "best_effort";
      diagnostics.push({
        severity: "warning",
        kind: "atomicity_downgrade",
        detail: "Requested atomicity downgraded to best_effort",
      });
    } else {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_ATOMICITY_UNSUPPORTED",
        message: "Requested atomicity is not allowed by policy",
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }
  }
  return { ok: true, value: { appliedAtomicity, diagnostics } };
}

function resolveAtomicityOutcome(
  appliedAtomicity: MultiDocumentAtomicity,
  errors: MultiDocumentDocResult[],
  conflicts: MultiDocumentDocResult[],
  diagnostics: gateway.GatewayDiagnostic[]
): MultiDocumentGatewayResponse | null {
  if (appliedAtomicity !== "all_or_nothing") {
    return null;
  }
  if (errors.length > 0) {
    const primaryError = errors[0].error;
    return {
      status: (primaryError?.status ?? 500) as MultiDocumentGatewayError["status"],
      code: primaryError?.code ?? "AI_MULTI_DOCUMENT_ERROR",
      message: primaryError?.message ?? "Multi-document request failed",
      diagnostics,
    };
  }
  if (conflicts.length > 0) {
    const failedDocuments = conflicts.map((doc) => ({
      doc_id: doc.doc_id,
      current_frontier: doc.conflict?.current_frontier,
      failed_preconditions: doc.conflict?.failed_preconditions,
      failed_references: doc.conflict?.failed_references,
    }));
    return {
      status: 409,
      code: "AI_PRECONDITION_FAILED",
      phase: "ai_gateway",
      retryable: true,
      failed_documents: failedDocuments,
      diagnostics,
    };
  }
  return null;
}

function buildReferenceRecord(
  refId: string,
  ref: MultiDocumentReferenceInput,
  request: MultiDocumentGatewayRequest
): CrossDocReferenceRecord {
  return {
    ref_id: refId,
    ref_type: ref.ref_type,
    source: {
      doc_id: documentId(ref.source.doc_id),
      block_id: ref.source.block_id,
      start: ref.source.start,
      end: ref.source.end,
      if_match_context_hash: ref.source.if_match_context_hash ?? null,
    },
    target: {
      doc_id: documentId(ref.target.doc_id),
      block_id: ref.target.block_id,
      anchor: ref.target.anchor,
    },
    created_at_ms: Date.now(),
    // internal validation ensures agent_id is present
    created_by: { agent_id: request.agent_id ?? "", request_id: request.request_id },
    v: 1,
  };
}

async function rollbackReferences(
  referenceStore: ReferenceStore,
  createdReferences: string[],
  appliedAtomicity: MultiDocumentAtomicity,
  reason: string
): Promise<void> {
  if (appliedAtomicity !== "all_or_nothing") {
    return;
  }
  for (const refId of createdReferences) {
    try {
      await referenceStore.updateReferenceStatus(refId, "deleted", reason);
    } catch {
      // Best-effort rollback only.
    }
  }
}

function mapReferenceCreationError(code: string): {
  status: 400 | 401 | 403 | 422 | 500 | 503;
  code: string;
} {
  if (code === "REF_ANCHOR_UNRESOLVED") {
    return { status: 422, code: "AI_REFERENCE_INVALID" };
  }
  if (code === "REF_STORE_NOT_CONFIGURED") {
    return { status: 503, code: "REF_STORE_NOT_CONFIGURED" };
  }
  if (code === "UNKNOWN") {
    return { status: 500, code: "AI_REFERENCE_INVALID" };
  }
  return { status: 400, code };
}

async function createReferences(
  referenceStore: ReferenceStore,
  references: MultiDocumentReferenceInput[],
  request: MultiDocumentGatewayRequest,
  appliedAtomicity: MultiDocumentAtomicity,
  diagnostics: gateway.GatewayDiagnostic[]
): Promise<ReferenceCreationResult> {
  const createdReferences: string[] = [];
  const failedReferences = new Map<string, ReferenceFailure[]>();

  for (let index = 0; index < references.length; index += 1) {
    const ref = references[index];
    const refId = ref.ref_id ?? `ref_${request.request_id}_${index}`;
    const record = buildReferenceRecord(refId, ref, request);

    try {
      await referenceStore.createReference(record);
      createdReferences.push(refId);
    } catch (error) {
      const errorCode = isRecord(error) && typeof error.code === "string" ? error.code : "UNKNOWN";

      if (errorCode === "REF_CONTEXT_HASH_MISMATCH") {
        const sourceDocId = ref.source.doc_id;
        const entries = failedReferences.get(sourceDocId) ?? [];
        entries.push({ ref_index: index, reason: "hash_mismatch" });
        failedReferences.set(sourceDocId, entries);
        continue;
      }

      await rollbackReferences(
        referenceStore,
        createdReferences,
        appliedAtomicity,
        "reference_create_failed"
      );
      const mapped = mapReferenceCreationError(errorCode);
      const response: MultiDocumentGatewayResponse = {
        status: mapped.status,
        code: mapped.code,
        message: "Reference creation failed",
        diagnostics,
      };
      return { ok: false, response };
    }
  }

  return { ok: true, createdReferences, failedReferences };
}

function buildFailedReferenceDocuments(
  failedReferences: Map<string, ReferenceFailure[]>,
  documents: NormalizedMultiDocDocument[],
  appliedFrontiers: Record<string, DocFrontierObject>
): FailedReferenceDocument[] {
  return [...failedReferences.entries()].map(([docId, failures]) => ({
    doc_id: docId,
    current_frontier:
      appliedFrontiers[docId] ?? documents.find((doc) => doc.doc_id === docId)?.frontier,
    failed_references: failures,
  }));
}

function applyFailedReferenceConflicts(
  results: MultiDocumentDocResult[],
  failedDocuments: FailedReferenceDocument[]
): void {
  for (const failed of failedDocuments) {
    const target = results.find((result) => result.doc_id === failed.doc_id);
    const conflict: MultiDocumentDocConflict = {
      code: "AI_PRECONDITION_FAILED",
      phase: "ai_gateway",
      retryable: true,
      current_frontier: failed.current_frontier,
      failed_references: failed.failed_references,
    };
    if (target) {
      target.success = false;
      target.conflict = conflict;
      continue;
    }
    results.push({
      doc_id: failed.doc_id,
      success: false,
      operations_applied: 0,
      conflict,
    });
  }
}

// Bump request_id so retries aren't short-circuited by gateway idempotency caching.
function updateRequestForRetry(
  request: gateway.AIGatewayRequest,
  attempt: number
): gateway.AIGatewayRequest {
  const baseId = request.request_id ?? request.client_request_id ?? "req";
  const retryId = `${baseId}-retry-${attempt}`;
  return {
    ...request,
    request_id: retryId,
    client_request_id: retryId,
  };
}

function collectContentChunks(blocks: LFCCBlock[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  const walk = (blockList: LFCCBlock[]): void => {
    for (const block of blockList) {
      chunks.push({ block_id: block.id, content: block.content, relevance: 1 });
      if (block.children && block.children.length > 0) {
        walk(block.children);
      }
    }
  };

  walk(blocks);
  return chunks;
}

function filterBlocksByPolicy(blocks: LFCCBlock[], contentMap: Map<string, string>): LFCCBlock[] {
  const filtered: LFCCBlock[] = [];

  for (const block of blocks) {
    const children = block.children ? filterBlocksByPolicy(block.children, contentMap) : undefined;
    const content = contentMap.get(block.id);
    const hasChildren = children !== undefined && children.length > 0;

    if (content === undefined && !hasChildren) {
      continue;
    }

    filtered.push({
      ...block,
      content: content ?? "",
      children: hasChildren ? children : undefined,
    });
  }

  return filtered;
}

function applyDataAccessPolicyToBlocks(
  blocks: LFCCBlock[],
  policy?: DataAccessPolicy
): { content: string; blocks: LFCCBlock[] } {
  const effectivePolicy: DataAccessPolicy = policy ?? {
    max_context_chars: 8000,
    redaction_strategy: "mask",
    pii_handling: "mask",
  };
  const chunks = collectContentChunks(blocks);
  const filteredChunks = applyDataAccessPolicyToChunks(chunks, effectivePolicy);
  if (filteredChunks.length !== chunks.length) {
    const keptIds = new Set(filteredChunks.map((chunk) => chunk.block_id));
    const omitted = chunks.filter((chunk) => !keptIds.has(chunk.block_id)).map((c) => c.block_id);
    if (omitted.length > 0) {
      logger.info("Omitted blocks from context", {
        omitted,
        total: chunks.length,
        kept: filteredChunks.length,
      });
    }
  }
  const contentMap = new Map(filteredChunks.map((chunk) => [chunk.block_id, chunk.content]));
  const content = filteredChunks.map((chunk) => chunk.content).join("\n\n");
  const filteredBlocks = filterBlocksByPolicy(blocks, contentMap);

  return { content, blocks: filteredBlocks };
}

function applyPolicyToSearchResults(
  results: SearchResult[],
  policy?: DataAccessPolicy
): SearchResult[] {
  const effectivePolicy: DataAccessPolicy = policy ?? {
    max_context_chars: 8000,
    redaction_strategy: "mask",
    pii_handling: "mask",
  };
  const chunks: ContentChunk[] = results.map((result) => ({
    block_id: result.blockId,
    content: result.content,
    relevance: result.score,
  }));
  const filteredChunks = applyDataAccessPolicyToChunks(chunks, effectivePolicy);
  const contentMap = new Map(filteredChunks.map((chunk) => [chunk.block_id, chunk.content]));

  return results
    .filter((result) => contentMap.has(result.blockId))
    .map((result) => ({
      ...result,
      content: contentMap.get(result.blockId) ?? "",
    }));
}

// ============================================================================
// Mock LFCC Bridge (for testing/development)
// ============================================================================

/**
 * Mock implementation for testing.
 * Replace with actual LFCC bridge in production.
 */
export class MockLFCCBridge implements ILFCCBridge {
  private documents = new Map<string, { doc: LFCCDocument; blocks: LFCCBlock[] }>();

  async getDocument(docId: string): Promise<LFCCDocument | null> {
    return this.documents.get(docId)?.doc ?? null;
  }

  async listDocuments(_options?: ListDocumentsOptions): Promise<LFCCDocumentMeta[]> {
    return Array.from(this.documents.values()).map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
    }));
  }

  async createDocument(title: string, content?: string): Promise<LFCCDocument> {
    const id = `doc_${Date.now()}`;
    const doc: LFCCDocument = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockCount: content ? 1 : 0,
      wordCount: content?.split(/\s+/).length ?? 0,
    };
    const blocks: LFCCBlock[] = content
      ? [{ id: `block_${Date.now()}`, type: "paragraph", content }]
      : [];
    this.documents.set(id, { doc, blocks });
    return doc;
  }

  async getContent(docId: string): Promise<string> {
    const entry = this.documents.get(docId);
    if (!entry) {
      return "";
    }
    return entry.blocks.map((b) => b.content).join("\n\n");
  }

  async getBlocks(docId: string): Promise<LFCCBlock[]> {
    return this.documents.get(docId)?.blocks ?? [];
  }

  async getBlock(docId: string, blockId: string): Promise<LFCCBlock | null> {
    const blocks = await this.getBlocks(docId);
    return blocks.find((b) => b.id === blockId) ?? null;
  }

  async insertBlock(
    docId: string,
    afterBlockId: string | null,
    content: string,
    type: BlockType = "paragraph"
  ): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const newBlock: LFCCBlock = {
      id: `block_${Date.now()}`,
      type,
      content,
    };

    if (afterBlockId === null) {
      entry.blocks.unshift(newBlock);
    } else {
      const index = entry.blocks.findIndex((b) => b.id === afterBlockId);
      if (index >= 0) {
        entry.blocks.splice(index + 1, 0, newBlock);
      } else {
        entry.blocks.push(newBlock);
      }
    }

    entry.doc.updatedAt = Date.now();
    entry.doc.blockCount = entry.blocks.length;

    return {
      type: "insert",
      blockId: newBlock.id,
      content,
      blockType: type,
      position: { afterBlockId },
      timestamp: Date.now(),
    };
  }

  async updateBlock(docId: string, blockId: string, content: string): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const block = entry.blocks.find((b) => b.id === blockId);
    if (!block) {
      throw new Error(`Block not found: ${blockId}`);
    }

    block.content = content;
    entry.doc.updatedAt = Date.now();

    return {
      type: "update",
      blockId,
      content,
      timestamp: Date.now(),
    };
  }

  async deleteBlock(docId: string, blockId: string): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = entry.blocks.findIndex((b) => b.id === blockId);
    if (index >= 0) {
      entry.blocks.splice(index, 1);
      entry.doc.blockCount = entry.blocks.length;
      entry.doc.updatedAt = Date.now();
    }

    return {
      type: "delete",
      blockId,
      timestamp: Date.now(),
    };
  }

  async moveBlock(
    docId: string,
    blockId: string,
    afterBlockId: string | null
  ): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const blockIndex = entry.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const [block] = entry.blocks.splice(blockIndex, 1);

    if (afterBlockId === null) {
      entry.blocks.unshift(block);
    } else {
      const targetIndex = entry.blocks.findIndex((b) => b.id === afterBlockId);
      if (targetIndex >= 0) {
        entry.blocks.splice(targetIndex + 1, 0, block);
      } else {
        entry.blocks.push(block);
      }
    }

    entry.doc.updatedAt = Date.now();

    return {
      type: "move",
      blockId,
      position: { afterBlockId },
      timestamp: Date.now(),
    };
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [, entry] of this.documents) {
      for (const block of entry.blocks) {
        if (block.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            docId: entry.doc.id,
            docTitle: entry.doc.title,
            blockId: block.id,
            content: block.content,
            score: 1.0,
          });
        }
      }
    }

    return results;
  }

  async applyOperations(_docId: string, _operations: LFCCOperation[]): Promise<void> {
    // Mock: operations are already applied in individual methods
  }
}

// ============================================================================
// LFCC Tool Server
// ============================================================================

export class LFCCToolServer extends BaseToolServer {
  readonly name = "lfcc";
  readonly description = "Document operations through LFCC (Local-First Collaboration Contract)";

  private readonly bridge: ILFCCBridge;
  private readonly aiGateway?: gateway.AIGateway;
  private readonly aiGatewayResolver?: (docId: string) => gateway.AIGateway | undefined;
  private readonly aiEnvelopeGateway?: AIEnvelopeGateway;
  private readonly aiEnvelopeGatewayResolver?: (docId: string) => AIEnvelopeGateway | undefined;
  private readonly rebaseProvider?: gateway.RebaseProvider;
  private readonly relocationProvider?: gateway.RelocationProvider;
  private readonly retryPolicy?: gateway.RetryPolicy;
  private readonly multiDocumentPolicy?: MultiDocumentPolicy;
  private readonly policyDomainResolver?: (docId: string) => string | null;
  private readonly referenceStore?: ReferenceStore;
  private readonly referenceStoreResolver?: (policyDomainId: string) => ReferenceStore | undefined;
  private readonly multiDocIdempotencyWindowMs: number;
  private readonly multiDocIdempotencyCache = new Map<
    string,
    { fingerprint: string; response: MultiDocumentGatewayResponse; storedAt: number }
  >();

  constructor(init?: LFCCToolServerInit) {
    super();
    const options = resolveLFCCToolServerOptions(init);
    this.bridge = options.bridge ?? new MockLFCCBridge();
    this.aiGateway = options.aiGateway;
    this.aiGatewayResolver = options.aiGatewayResolver;
    this.aiEnvelopeGateway = options.aiEnvelopeGateway;
    this.aiEnvelopeGatewayResolver = options.aiEnvelopeGatewayResolver;
    this.rebaseProvider = options.rebaseProvider;
    this.relocationProvider = options.relocationProvider;
    this.retryPolicy = options.retryPolicy;
    this.multiDocumentPolicy = options.multiDocumentPolicy;
    this.policyDomainResolver = options.policyDomainResolver;
    this.referenceStore = options.referenceStore;
    this.referenceStoreResolver = options.referenceStoreResolver;
    this.multiDocIdempotencyWindowMs =
      options.multiDocIdempotencyWindowMs ?? DEFAULT_MULTI_DOC_IDEMPOTENCY_WINDOW_MS;

    this.registerTools();
    if (
      this.aiGateway ||
      this.aiGatewayResolver ||
      this.aiEnvelopeGateway ||
      this.aiEnvelopeGatewayResolver
    ) {
      this.registerAIGatewayTools();
    }
  }

  private registerTools(): void {
    // List documents
    this.registerTool(
      {
        name: "list_documents",
        description: "List available documents",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of documents to return" },
            sortBy: { type: "string", enum: ["title", "updatedAt", "createdAt"] },
          },
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleListDocuments.bind(this)
    );

    // Get document
    this.registerTool(
      {
        name: "get_document",
        description: "Get a document by ID",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleGetDocument.bind(this)
    );

    // Read content
    this.registerTool(
      {
        name: "read_content",
        description: "Read the full content of a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleReadContent.bind(this)
    );

    // Get blocks
    this.registerTool(
      {
        name: "get_blocks",
        description: "Get all blocks in a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleGetBlocks.bind(this)
    );

    // Insert block
    this.registerTool(
      {
        name: "insert_block",
        description: "Insert a new block into a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            afterBlockId: {
              type: "string",
              description: "Insert after this block (null for beginning)",
            },
            content: { type: "string", description: "Block content" },
            type: {
              type: "string",
              description: "Block type",
              enum: [
                "paragraph",
                "heading1",
                "heading2",
                "heading3",
                "bullet_list",
                "numbered_list",
                "quote",
                "code",
                "divider",
              ],
            },
          },
          required: ["docId", "content"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleInsertBlock.bind(this)
    );

    // Update block
    this.registerTool(
      {
        name: "update_block",
        description: "Update an existing block",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            blockId: { type: "string", description: "Block ID to update" },
            content: { type: "string", description: "New content" },
          },
          required: ["docId", "blockId", "content"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleUpdateBlock.bind(this)
    );

    // Delete block
    this.registerTool(
      {
        name: "delete_block",
        description: "Delete a block from a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            blockId: { type: "string", description: "Block ID to delete" },
          },
          required: ["docId", "blockId"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleDeleteBlock.bind(this)
    );

    // Search
    this.registerTool(
      {
        name: "search",
        description: "Search across documents",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Maximum results" },
            semantic: { type: "boolean", description: "Use semantic search" },
          },
          required: ["query"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "medium",
          policyAction: "connector.read",
        },
      },
      this.handleSearch.bind(this)
    );
  }

  private registerAIGatewayTools(): void {
    this.registerTool(
      {
        name: "ai_gateway_request",
        description: "Validate and dry-run AI payloads through the LFCC AI Gateway",
        inputSchema: {
          type: "object",
          properties: {
            request: {
              type: "object",
              description: "AIGatewayRequest payload (doc_frontier, target_spans, payload, etc.)",
            },
            retry: {
              type: "object",
              properties: {
                enabled: { type: "boolean", description: "Enable 409 rebase + retry flow" },
                originalTexts: {
                  type: "object",
                  description: "Original span texts keyed by span_id (for relocation)",
                },
                policy: {
                  type: "object",
                  description: "Override retry policy (max_retries, relocation_level, backoff)",
                },
              },
            },
          },
          required: ["request"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "medium",
          policyAction: "connector.action",
        },
      },
      this.handleAIGatewayRequest.bind(this)
    );

    this.registerTool(
      {
        name: "ai_gateway_multi_request",
        description: "Validate multi-document AI Gateway requests with policy enforcement",
        inputSchema: {
          type: "object",
          properties: {
            request: {
              type: "object",
              description: "Multi-document AI Gateway request payload",
            },
          },
          required: ["request"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "medium",
          policyAction: "connector.action",
        },
      },
      this.handleAIGatewayMultiRequest.bind(this)
    );
  }

  // Handler implementations

  private resolveGateway(docId?: string, allowFallback = true): gateway.AIGateway | undefined {
    if (docId && this.aiGatewayResolver) {
      const resolved = this.aiGatewayResolver(docId);
      if (resolved) {
        return resolved;
      }
      return allowFallback ? this.aiGateway : undefined;
    }
    return this.aiGateway;
  }

  private resolveEnvelopeGateway(
    docId?: string,
    allowFallback = true
  ): AIEnvelopeGateway | undefined {
    if (docId && this.aiEnvelopeGatewayResolver) {
      const resolved = this.aiEnvelopeGatewayResolver(docId);
      if (resolved) {
        return resolved;
      }
      return allowFallback ? this.aiEnvelopeGateway : undefined;
    }
    return this.aiEnvelopeGateway;
  }

  private resolveReferenceStore(policyDomainId?: string): ReferenceStore | undefined {
    if (policyDomainId && this.referenceStoreResolver) {
      return this.referenceStoreResolver(policyDomainId);
    }
    return this.referenceStore;
  }

  private resolvePolicyDomainForDocuments(
    documents: NormalizedMultiDocDocument[]
  ): ToolResultOr<string | undefined> {
    if (this.policyDomainResolver) {
      const domains = documents.map((doc) => this.policyDomainResolver?.(doc.doc_id));
      if (domains.some((domain) => !domain)) {
        const response: MultiDocumentGatewayResponse = {
          status: 403,
          code: "AI_DOCUMENT_FORBIDDEN",
          message: "Document access denied by policy domain resolver",
        };
        return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
      }
      const uniqueDomains = new Set(domains as string[]);
      if (uniqueDomains.size > 1) {
        const response: MultiDocumentGatewayResponse = {
          status: 403,
          code: "AI_DOCUMENT_FORBIDDEN",
          message: "Documents span multiple policy domains",
        };
        return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
      }
      return { ok: true, value: domains[0] as string };
    }
    if (documents.length > 1) {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
        message: "Policy domain resolver is not configured for multi-document requests",
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }
    return { ok: true, value: undefined };
  }

  private pruneMultiDocIdempotencyCache(now: number): void {
    for (const [key, entry] of this.multiDocIdempotencyCache.entries()) {
      if (now - entry.storedAt > this.multiDocIdempotencyWindowMs) {
        this.multiDocIdempotencyCache.delete(key);
      }
    }
  }

  private buildMultiDocFingerprint(request: MultiDocumentGatewayRequest): string {
    return stableStringify({
      ...request,
      documents: [...request.documents].sort((a, b) => a.doc_id.localeCompare(b.doc_id)),
    });
  }

  private getMultiDocIdempotencyState(
    request: MultiDocumentGatewayRequest,
    now: number
  ): ToolResultOr<{ fingerprint: string; cached?: MultiDocumentGatewayResponse }> {
    const fingerprint = this.buildMultiDocFingerprint(request);
    const cached = this.multiDocIdempotencyCache.get(request.request_id);
    if (cached && now - cached.storedAt <= this.multiDocIdempotencyWindowMs) {
      if (cached.fingerprint !== fingerprint) {
        const response: MultiDocumentGatewayResponse = {
          status: 400,
          code: "AI_IDEMPOTENCY_KEY_REUSED",
          message: "Request idempotency key reused with different payload",
        };
        return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
      }
      return { ok: true, value: { fingerprint, cached: cached.response } };
    }
    return { ok: true, value: { fingerprint } };
  }

  private prepareMultiDocRequest(
    args: Record<string, unknown>
  ): ToolResultOr<PreparedMultiDocRequest> {
    const parsedRequest = parseMultiDocRequestPayload(args);
    if (!parsedRequest.ok) {
      return parsedRequest;
    }
    const request = parsedRequest.value;

    const policyResult = ensureMultiDocPolicyEnabled(this.multiDocumentPolicy);
    if (!policyResult.ok) {
      return policyResult;
    }
    const policy = policyResult.value;

    const basicsResult = validateMultiDocRequestBasics(request);
    if (!basicsResult.ok) {
      return basicsResult;
    }

    const normalizedDocsResult = normalizeMultiDocDocuments(request);
    if (!normalizedDocsResult.ok) {
      return {
        ok: false,
        error: errorResult("INVALID_ARGUMENTS", normalizedDocsResult.error),
      };
    }
    const documents = normalizedDocsResult.documents;

    const limitResult = validateMultiDocDocumentsLimit(documents, policy);
    if (!limitResult.ok) {
      return limitResult;
    }

    const targetResult = resolveTargetDocuments(documents, policy);
    if (!targetResult.ok) {
      return targetResult;
    }
    const targetDocuments = targetResult.value;

    const opsResult = validateTotalOps(targetDocuments, policy);
    if (!opsResult.ok) {
      return opsResult;
    }

    const referencesResult = resolveReferences(request, documents, policy);
    if (!referencesResult.ok) {
      return referencesResult;
    }
    const references = referencesResult.value;

    const atomicityResult = resolveAtomicity(policy, request.atomicity);
    if (!atomicityResult.ok) {
      return atomicityResult;
    }
    const { appliedAtomicity, diagnostics } = atomicityResult.value;

    const policyDomainResult = this.resolvePolicyDomainForDocuments(documents);
    if (!policyDomainResult.ok) {
      return policyDomainResult;
    }
    const policyDomainId = policyDomainResult.value;

    return {
      ok: true,
      value: {
        request,
        documents,
        targetDocuments,
        references,
        appliedAtomicity,
        diagnostics,
        policyDomainId,
      },
    };
  }

  private createMultiDocTargetAccumulator(): MultiDocTargetAccumulator {
    return {
      results: [],
      appliedFrontiers: {},
      conflicts: [],
      errors: [],
    };
  }

  private recordMultiDocOutcome(
    accumulator: MultiDocTargetAccumulator,
    docId: string,
    outcome: MultiDocTargetOutcome
  ): void {
    accumulator.results.push(outcome.docResult);
    if (outcome.frontier) {
      accumulator.appliedFrontiers[docId] = outcome.frontier;
    }
    if (outcome.docResult.conflict) {
      accumulator.conflicts.push(outcome.docResult);
    }
    if (outcome.docResult.error) {
      accumulator.errors.push(outcome.docResult);
    }
  }

  private async executeMultiDocTarget(
    request: MultiDocumentGatewayRequest,
    doc: NormalizedMultiDocDocument
  ): Promise<ToolResultOr<MultiDocTargetOutcome>> {
    if (doc.gateway_request) {
      return this.processGatewayTarget(request, doc);
    }
    return this.processEnvelopeTarget(request, doc);
  }

  private async processGatewayTarget(
    request: MultiDocumentGatewayRequest,
    doc: NormalizedMultiDocDocument
  ): Promise<ToolResultOr<MultiDocTargetOutcome>> {
    const aiGateway = this.resolveGateway(doc.doc_id, false);
    if (!aiGateway) {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
        message: `AI Gateway is not configured for ${doc.doc_id}`,
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }

    if (!doc.gateway_request) {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
        message: `Target document ${doc.doc_id} is missing gateway_request`,
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }

    const perDocRequestId = buildPerDocRequestId(request.request_id, doc.doc_id);
    const gatewayRequest: gateway.AIGatewayRequest = {
      ...doc.gateway_request,
      request_id: perDocRequestId,
      client_request_id: perDocRequestId,
    };

    const gatewayResult = await aiGateway.processRequest(gatewayRequest);
    return { ok: true, value: mapGatewayResult(doc.doc_id, gatewayResult) };
  }

  private async processEnvelopeTarget(
    request: MultiDocumentGatewayRequest,
    doc: NormalizedMultiDocDocument
  ): Promise<ToolResultOr<MultiDocTargetOutcome>> {
    if (!doc.ops_xml) {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
        message: `Target document ${doc.doc_id} is missing gateway_request or ops_xml`,
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }

    const envelopeGateway = this.resolveEnvelopeGateway(doc.doc_id, false);
    if (!envelopeGateway) {
      const response: MultiDocumentGatewayResponse = {
        status: 400,
        code: "AI_MULTI_DOCUMENT_UNSUPPORTED",
        message: `AI Envelope gateway is not configured for ${doc.doc_id}`,
      };
      return { ok: false, error: textResult(JSON.stringify(response, null, 2)) };
    }

    const perDocRequestId = buildPerDocRequestId(request.request_id, doc.doc_id);
    const envelopeRequest = normalizeAIRequestEnvelope({
      request_id: perDocRequestId,
      client_request_id: perDocRequestId,
      agent_id: request.agent_id ?? "",
      doc_frontier: doc.frontierTag,
      doc_frontier_tag: doc.frontierTag,
      ops_xml: doc.ops_xml,
      preconditions: doc.preconditions ?? [],
      intent_id: request.intent_id,
      intent: request.intent as EditIntent,
      policy_context: request.policy_context,
    });

    const envelopeResult = await envelopeGateway.processRequest(envelopeRequest);
    return { ok: true, value: mapEnvelopeResult(doc, envelopeResult) };
  }

  private async processMultiDocTargets(
    request: MultiDocumentGatewayRequest,
    targetDocuments: NormalizedMultiDocDocument[]
  ): Promise<
    ToolResultOr<{
      results: MultiDocumentDocResult[];
      appliedFrontiers: Record<string, DocFrontierObject>;
      conflicts: MultiDocumentDocResult[];
      errors: MultiDocumentDocResult[];
    }>
  > {
    const accumulator = this.createMultiDocTargetAccumulator();

    for (const doc of targetDocuments) {
      const outcome = await this.executeMultiDocTarget(request, doc);
      if (!outcome.ok) {
        return outcome;
      }
      this.recordMultiDocOutcome(accumulator, doc.doc_id, outcome.value);
    }

    return { ok: true, value: accumulator };
  }

  private async processReferences(
    references: MultiDocumentReferenceInput[],
    request: MultiDocumentGatewayRequest,
    documents: NormalizedMultiDocDocument[],
    appliedFrontiers: Record<string, DocFrontierObject>,
    appliedAtomicity: MultiDocumentAtomicity,
    policyDomainId: string | undefined,
    results: MultiDocumentDocResult[],
    diagnostics: gateway.GatewayDiagnostic[],
    allTargetsSucceeded: boolean
  ): Promise<ReferenceProcessResult> {
    if (references.length === 0) {
      return { ok: true, createdReferences: [] };
    }

    if (!allTargetsSucceeded) {
      diagnostics.push({
        severity: "warning",
        kind: "references_skipped",
        detail: "References skipped because not all target documents succeeded",
      });
      return { ok: true, createdReferences: [] };
    }

    const referenceStore = this.resolveReferenceStore(policyDomainId);
    if (!referenceStore) {
      const response: MultiDocumentGatewayResponse = {
        status: 503,
        code: "REF_STORE_NOT_CONFIGURED",
        message: "Reference store is not configured",
        diagnostics,
      };
      return { ok: false, response };
    }

    const createResult = await createReferences(
      referenceStore,
      references,
      request,
      appliedAtomicity,
      diagnostics
    );
    if (!createResult.ok) {
      return { ok: false, response: createResult.response };
    }

    if (createResult.failedReferences.size > 0) {
      const failedDocuments = buildFailedReferenceDocuments(
        createResult.failedReferences,
        documents,
        appliedFrontiers
      );

      if (appliedAtomicity === "best_effort") {
        applyFailedReferenceConflicts(results, failedDocuments);
        diagnostics.push({
          severity: "error",
          kind: "reference_precondition_failed",
          detail: "One or more references failed precondition checks",
        });
        return { ok: true, createdReferences: createResult.createdReferences };
      }

      await rollbackReferences(
        referenceStore,
        createResult.createdReferences,
        appliedAtomicity,
        "reference_precondition_failed"
      );
      const response: MultiDocumentGatewayResponse = {
        status: 409,
        code: "AI_PRECONDITION_FAILED",
        phase: "ai_gateway",
        retryable: true,
        failed_documents: failedDocuments,
        diagnostics,
      };
      return { ok: false, response };
    }

    return { ok: true, createdReferences: createResult.createdReferences };
  }

  private async handleListDocuments(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const limit = parseOptionalNumber(args.limit, "limit", { min: 1, integer: true });
    if (limit.error) {
      return invalidArgs(limit.error);
    }
    const sortBy = parseOptionalEnum(args.sortBy, "sortBy", LIST_SORT_FIELDS);
    if (sortBy.error) {
      return invalidArgs(sortBy.error);
    }

    const docs = await this.bridge.listDocuments({
      limit: limit.value,
      sortBy: sortBy.value,
    });

    const formatted = docs.map((d) => `- ${d.title} (${d.id})`).join("\n");
    return textResult(`Documents:\n${formatted || "(no documents)"}`);
  }

  private async handleGetDocument(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const doc = await this.bridge.getDocument(docId.value);

    if (!doc) {
      return errorResult("RESOURCE_NOT_FOUND", `Document not found: ${docId}`);
    }

    return textResult(
      `Document: ${doc.title}\nID: ${doc.id}\nBlocks: ${doc.blockCount}\nWords: ${doc.wordCount}\nUpdated: ${new Date(doc.updatedAt).toISOString()}`
    );
  }

  private async handleReadContent(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const dataAccessPolicy = context.security.dataAccessPolicy;
    if (dataAccessPolicy) {
      const blocks = await this.bridge.getBlocks(docId.value);
      const { content } = applyDataAccessPolicyToBlocks(blocks, dataAccessPolicy);
      return textResult(content || "(empty document)");
    }

    const content = await this.bridge.getContent(docId.value);
    return textResult(content || "(empty document)");
  }

  private async handleGetBlocks(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const blocks = await this.bridge.getBlocks(docId.value);
    const dataAccessPolicy = context.security.dataAccessPolicy;
    const filteredBlocks = dataAccessPolicy
      ? applyDataAccessPolicyToBlocks(blocks, dataAccessPolicy).blocks
      : blocks;

    const formatted = filteredBlocks
      .map(
        (b) =>
          `[${b.id}] (${b.type}) ${b.content.slice(0, 100)}${b.content.length > 100 ? "..." : ""}`
      )
      .join("\n");

    return textResult(`Blocks:\n${formatted || "(no blocks)"}`);
  }

  private async handleInsertBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const afterBlockId = parseOptionalStringOrNull(args.afterBlockId, "afterBlockId");
    if (afterBlockId.error) {
      return invalidArgs(afterBlockId.error);
    }
    const content = parseRequiredContent(args.content, "content");
    if (content.error) {
      return invalidArgs(content.error);
    }
    const type = parseBlockType(args.type);
    if (type.error) {
      return invalidArgs(type.error);
    }

    const op = await this.bridge.insertBlock(
      docId.value,
      afterBlockId.value,
      content.value,
      type.value ?? "paragraph"
    );

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:insert_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId: op.blockId },
      sandboxed: false,
    });

    return textResult(`Inserted block: ${op.blockId}`);
  }

  private async handleUpdateBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const blockId = parseRequiredId(args.blockId, "blockId");
    if (blockId.error) {
      return invalidArgs(blockId.error);
    }
    const content = parseRequiredContent(args.content, "content");
    if (content.error) {
      return invalidArgs(content.error);
    }

    await this.bridge.updateBlock(docId.value, blockId.value, content.value);

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:update_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId },
      sandboxed: false,
    });

    return textResult(`Updated block: ${blockId}`);
  }

  private async handleDeleteBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = parseRequiredId(args.docId, "docId");
    if (docId.error) {
      return invalidArgs(docId.error);
    }
    const blockId = parseRequiredId(args.blockId, "blockId");
    if (blockId.error) {
      return invalidArgs(blockId.error);
    }

    await this.bridge.deleteBlock(docId.value, blockId.value);

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:delete_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId },
      sandboxed: false,
    });

    return textResult(`Deleted block: ${blockId}`);
  }

  private async handleSearch(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const query = parseRequiredId(args.query, "query");
    if (query.error) {
      return invalidArgs(query.error);
    }
    const limit = parseOptionalNumber(args.limit, "limit", { min: 1, integer: true });
    if (limit.error) {
      return invalidArgs(limit.error);
    }
    const semantic = parseOptionalBoolean(args.semantic, "semantic");
    if (semantic.error) {
      return invalidArgs(semantic.error);
    }

    const results = await this.bridge.search(query.value, {
      limit: limit.value,
      semantic: semantic.value,
    });
    const dataAccessPolicy = context.security.dataAccessPolicy;
    const filteredResults = dataAccessPolicy
      ? applyPolicyToSearchResults(results, dataAccessPolicy)
      : results;

    if (filteredResults.length === 0) {
      return textResult("No results found");
    }

    const formatted = filteredResults
      .map((r) => `- [${r.docTitle}] ${r.content.slice(0, 100)}...`)
      .join("\n");

    return textResult(`Search results for "${query}":\n${formatted}`);
  }

  private async handleAIGatewayRequest(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const payload = args as Partial<AIGatewayToolPayload>;
    const request = payload.request;
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      return errorResult("INVALID_ARGUMENTS", "request must be an object");
    }
    const parsedRequest = gateway.parseGatewayRequest(request);
    if (!parsedRequest) {
      return errorResult("INVALID_ARGUMENTS", "request is invalid");
    }
    const gatewayRequest = parsedRequest;

    const docId = typeof gatewayRequest.doc_id === "string" ? gatewayRequest.doc_id : undefined;
    const aiGateway = this.resolveGateway(docId);
    if (!aiGateway) {
      return errorResult("EXECUTION_FAILED", "AI Gateway is not configured");
    }

    const initialResult = await aiGateway.processRequest(gatewayRequest);
    const retryOptions = (payload.retry ?? {}) as AIGatewayRetryOptions;
    const retryEnabled = retryOptions.enabled === true;

    if (!retryEnabled || !gateway.isGateway409(initialResult)) {
      this.logGatewayAudit(context, gatewayRequest, initialResult.status);
      return textResult(JSON.stringify(initialResult, null, 2));
    }

    if (!this.rebaseProvider || !this.relocationProvider) {
      return errorResult(
        "EXECUTION_FAILED",
        "Retry requested but rebase/relocation providers are not configured"
      );
    }

    const policy = retryOptions.policy ?? this.retryPolicy ?? gateway.DEFAULT_RETRY_POLICY;
    const originalTexts = normalizeOriginalTexts(retryOptions.originalTexts);
    const retryResult = await gateway.executeRetryLoop(
      gatewayRequest,
      initialResult,
      policy,
      this.rebaseProvider,
      this.relocationProvider,
      originalTexts
    );

    if (!retryResult.success) {
      this.logGatewayAudit(context, gatewayRequest, initialResult.status);
      return textResult(JSON.stringify({ initial: initialResult, retry: retryResult }, null, 2));
    }

    const retriedRequest = updateRequestForRetry(retryResult.request, retryResult.attempts);
    const retriedResult = await aiGateway.processRequest(retriedRequest);
    this.logGatewayAudit(context, retriedRequest, retriedResult.status);

    return textResult(
      JSON.stringify({ initial: initialResult, retry: retryResult, result: retriedResult }, null, 2)
    );
  }

  private async handleAIGatewayMultiRequest(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const preparation = this.prepareMultiDocRequest(args);
    if (!preparation.ok) {
      return preparation.error;
    }
    const {
      request,
      documents,
      targetDocuments,
      references,
      appliedAtomicity,
      diagnostics,
      policyDomainId,
    } = preparation.value;

    const now = Date.now();
    this.pruneMultiDocIdempotencyCache(now);
    const idempotencyResult = this.getMultiDocIdempotencyState(request, now);
    if (!idempotencyResult.ok) {
      return idempotencyResult.error;
    }
    if (idempotencyResult.value.cached) {
      return textResult(JSON.stringify(idempotencyResult.value.cached, null, 2));
    }
    const fingerprint = idempotencyResult.value.fingerprint;

    const processResult = await this.processMultiDocTargets(request, targetDocuments);
    if (!processResult.ok) {
      return processResult.error;
    }
    const { results, appliedFrontiers, conflicts, errors } = processResult.value;

    const storeResponse = (response: MultiDocumentGatewayResponse): MCPToolResult => {
      this.multiDocIdempotencyCache.set(request.request_id, {
        fingerprint,
        response,
        storedAt: now,
      });
      this.logMultiDocGatewayAudit(context, request, response.status, targetDocuments);
      return textResult(JSON.stringify(response, null, 2));
    };

    const atomicityOutcome = resolveAtomicityOutcome(
      appliedAtomicity,
      errors,
      conflicts,
      diagnostics
    );
    if (atomicityOutcome) {
      return storeResponse(atomicityOutcome);
    }

    const allTargetsSucceeded = results.every((result) => result.success);
    const referenceResult = await this.processReferences(
      references,
      request,
      documents,
      appliedFrontiers,
      appliedAtomicity,
      policyDomainId,
      results,
      diagnostics,
      allTargetsSucceeded
    );
    if (!referenceResult.ok) {
      return storeResponse(referenceResult.response);
    }

    const response: MultiDocumentGatewayResponse = {
      status: 200,
      operation_id: request.request_id,
      applied_atomicity: appliedAtomicity,
      applied_frontiers: appliedFrontiers,
      results,
      created_references: referenceResult.createdReferences,
      diagnostics,
    };
    return storeResponse(response);
  }

  private logGatewayAudit(
    context: ToolContext,
    request: gateway.AIGatewayRequest,
    status: number
  ): void {
    const requestId = request.request_id ?? request.client_request_id;
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:ai_gateway_request",
      action: "result",
      userId: context.userId,
      input: {
        docId: request.doc_id,
        requestId,
        status,
      },
      sandboxed: false,
    });
  }

  private logMultiDocGatewayAudit(
    context: ToolContext,
    request: MultiDocumentGatewayRequest,
    status: number,
    documents: Array<{ doc_id: string }>
  ): void {
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:ai_gateway_multi_request",
      action: "result",
      userId: context.userId,
      input: {
        docIds: documents.map((doc) => doc.doc_id),
        requestId: request.request_id,
        status,
      },
      sandboxed: false,
    });
  }
}

/**
 * Create an LFCC tool server with the provided bridge or gateway configuration.
 */
export function createLFCCToolServer(init?: LFCCToolServerInit): LFCCToolServer {
  return new LFCCToolServer(init);
}

function invalidArgs(message: string): MCPToolResult {
  return errorResult("INVALID_ARGUMENTS", message);
}

function parseRequiredId(value: unknown, label: string): { value: string; error?: string } {
  if (typeof value !== "string") {
    return { value: "", error: `${label} is required` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: "", error: `${label} is required` };
  }
  return { value: trimmed };
}

function parseRequiredContent(value: unknown, label: string): { value: string; error?: string } {
  if (typeof value !== "string") {
    return { value: "", error: `${label} must be a string` };
  }
  return { value };
}

function parseOptionalStringOrNull(
  value: unknown,
  label: string
): { value: string | null; error?: string } {
  if (value === null || value === undefined) {
    return { value: null };
  }
  if (typeof value !== "string") {
    return { value: null, error: `${label} must be a string or null` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, error: `${label} must be a non-empty string or null` };
  }
  return { value: trimmed };
}

function parseBlockType(value: unknown): { value?: BlockType; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string") {
    return { error: "type must be a string" };
  }
  if (!BLOCK_TYPE_SET.has(value as BlockType)) {
    return { error: `type must be one of: ${BLOCK_TYPES.join(", ")}` };
  }
  return { value: value as BlockType };
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: Set<T>
): { value?: T; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string") {
    return { error: `${label} must be a string` };
  }
  if (!allowed.has(value as T)) {
    return { error: `${label} must be one of: ${Array.from(allowed).join(", ")}` };
  }
  return { value: value as T };
}

function parseOptionalBoolean(value: unknown, label: string): { value?: boolean; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "boolean") {
    return { error: `${label} must be a boolean` };
  }
  return { value };
}

function parseOptionalNumber(
  value: unknown,
  label: string,
  options: { min?: number; integer?: boolean } = {}
): { value?: number; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `${label} must be a number` };
  }
  const normalized = options.integer ? Math.floor(value) : value;
  if (options.min !== undefined && normalized < options.min) {
    return { error: `${label} must be >= ${options.min}` };
  }
  return { value: normalized };
}
