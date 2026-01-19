/**
 * LFCC v0.9.3 - Loro-backed Reference Store
 *
 * Implements the workspace graph document for cross-document references.
 */

import type {
  CrossDocReferenceRecord,
  ReferenceEntry,
  ReferenceStatus,
  ReferenceStore,
  ReferenceStoreFrontier,
} from "@ku0/core";
import { documentId, stableStringify } from "@ku0/core";
import { type LoroFrontiers, LoroList, LoroMap, type LoroRuntime } from "../runtime/loroRuntime";

const REF_STORE_VERSION = "1.0";
const REF_STORE_ORIGIN_PREFIX = "ref_store";
const REF_STORE_DOC_ID_PREFIX = "lfcc_ref_store::";

export function referenceStoreDocId(policyDomainId: string): string {
  return `${REF_STORE_DOC_ID_PREFIX}${policyDomainId}`;
}

export type ReferenceVerificationResult =
  | { ok: true }
  | { ok: false; code: ReferenceStoreErrorCode; reason?: string };

export interface ReferenceVerificationProvider {
  verifyReference(record: CrossDocReferenceRecord): ReferenceVerificationResult;
}

export type ReferenceStoreErrorCode =
  | "REF_STORE_NOT_CONFIGURED"
  | "REF_ANCHOR_UNRESOLVED"
  | "REF_CONTEXT_HASH_MISMATCH"
  | "REF_ALREADY_EXISTS"
  | "REF_NOT_FOUND";

export class ReferenceStoreError extends Error {
  readonly code: ReferenceStoreErrorCode;

  constructor(code: ReferenceStoreErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type LoroReferenceStoreOptions = {
  policyDomainId: string;
  runtime: LoroRuntime;
  verifier: ReferenceVerificationProvider;
};

type ReferenceAuditEvent = {
  event: "create" | "update" | "delete" | "verify" | "relocate";
  at_ms: number;
  by: { agent_id: string; request_id: string };
  from_status?: ReferenceStatus | null;
  to_status: ReferenceStatus;
  reason?: string;
};

function serializeRecordForIdempotency(record: CrossDocReferenceRecord): string {
  const source: CrossDocReferenceRecord["source"] = {
    doc_id: record.source.doc_id,
    block_id: record.source.block_id,
    start: record.source.start,
    end: record.source.end,
    ...(typeof record.source.if_match_context_hash === "string"
      ? { if_match_context_hash: record.source.if_match_context_hash }
      : {}),
  };
  return stableStringify({
    ref_id: record.ref_id,
    ref_type: record.ref_type,
    source,
    target: record.target,
    created_at_ms: record.created_at_ms,
    created_by: record.created_by,
    v: record.v,
  });
}

export class LoroReferenceStore implements ReferenceStore {
  private readonly runtime: LoroRuntime;
  private readonly policyDomainId: string;
  private readonly verifier: ReferenceVerificationProvider;

  constructor(options: LoroReferenceStoreOptions) {
    this.runtime = options.runtime;
    this.policyDomainId = options.policyDomainId;
    this.verifier = options.verifier;
    this.ensureRuntimeIdentity();
    this.ensureRoot();
  }

  createReference(record: CrossDocReferenceRecord): Promise<void> {
    const references = this.getReferencesMap();
    const existing = this.getEntryMap(record.ref_id);
    if (existing) {
      const existingRecord = parseRecord(existing.get("record"));
      if (existingRecord?.created_by.request_id === record.created_by.request_id) {
        const existingHash = serializeRecordForIdempotency(existingRecord);
        const incomingHash = serializeRecordForIdempotency(record);
        if (existingHash !== incomingHash) {
          throw new ReferenceStoreError(
            "REF_ALREADY_EXISTS",
            `Reference already exists with different content: ${record.ref_id}`
          );
        }
        return Promise.resolve();
      }
      throw new ReferenceStoreError(
        "REF_ALREADY_EXISTS",
        `Reference already exists: ${record.ref_id}`
      );
    }

    const verification = this.verifier.verifyReference(record);
    if (!verification.ok) {
      throw new ReferenceStoreError(
        verification.code,
        verification.reason ?? "Reference verification failed"
      );
    }

    const entry = references.getOrCreateContainer(record.ref_id, new LoroMap());
    writeRecord(entry.getOrCreateContainer("record", new LoroMap()), record);

    const meta = entry.getOrCreateContainer("meta", new LoroMap());
    meta.set("status", "active");
    meta.set("updated_at_ms", Date.now());
    const updatedBy = meta.getOrCreateContainer("updated_by", new LoroMap());
    updatedBy.set("agent_id", record.created_by.agent_id);
    updatedBy.set("request_id", record.created_by.request_id);

    const audit = entry.getOrCreateContainer("audit", new LoroList());
    const event: ReferenceAuditEvent = {
      event: "create",
      at_ms: Date.now(),
      by: record.created_by,
      from_status: null,
      to_status: "active",
    };
    audit.push(JSON.stringify(event));

    this.runtime.commit(`${REF_STORE_ORIGIN_PREFIX}:create`);
    return Promise.resolve();
  }

  updateReferenceStatus(refId: string, status: ReferenceStatus, reason: string): Promise<void> {
    const entry = this.getEntryMap(refId);
    if (!entry) {
      throw new ReferenceStoreError("REF_NOT_FOUND", `Reference not found: ${refId}`);
    }

    const meta = entry.getOrCreateContainer("meta", new LoroMap());
    const prevStatus = readStatus(meta);
    meta.set("status", status);
    meta.set("updated_at_ms", Date.now());
    const updatedBy = meta.getOrCreateContainer("updated_by", new LoroMap());
    updatedBy.set("agent_id", "system");
    updatedBy.set("request_id", "reference-store");
    if (status === "deleted") {
      meta.set("deleted_at_ms", Date.now());
    }

    const audit = entry.getOrCreateContainer("audit", new LoroList());
    const event: ReferenceAuditEvent = {
      event: status === "deleted" ? "delete" : "update",
      at_ms: Date.now(),
      by: { agent_id: "system", request_id: "reference-store" },
      from_status: prevStatus ?? null,
      to_status: status,
      reason,
    };
    audit.push(JSON.stringify(event));

    this.runtime.commit(`${REF_STORE_ORIGIN_PREFIX}:update`);
    return Promise.resolve();
  }

  async refreshVerification(refId: string): Promise<boolean> {
    const entry = this.getEntryMap(refId);
    if (!entry) {
      throw new ReferenceStoreError("REF_NOT_FOUND", `Reference not found: ${refId}`);
    }
    const recordMap = entry.get("record");
    const record = parseRecord(recordMap);
    if (!record) {
      throw new ReferenceStoreError("REF_NOT_FOUND", `Reference record missing: ${refId}`);
    }

    const verification = this.verifier.verifyReference(record);
    const meta = entry.getOrCreateContainer("meta", new LoroMap());
    const prevStatus = readStatus(meta);
    if (prevStatus === "deleted") {
      return false;
    }
    const nextStatus = verification.ok ? "active" : "orphan";
    meta.set("status", nextStatus);
    meta.set("updated_at_ms", Date.now());
    const updatedBy = meta.getOrCreateContainer("updated_by", new LoroMap());
    updatedBy.set("agent_id", "system");
    updatedBy.set("request_id", "reference-store");

    if (verification.ok) {
      (recordMap as LoroMap).set("verified_at_ms", Date.now());
    }

    const audit = entry.getOrCreateContainer("audit", new LoroList());
    const event: ReferenceAuditEvent = {
      event: "verify",
      at_ms: Date.now(),
      by: { agent_id: "system", request_id: "reference-store" },
      from_status: prevStatus ?? null,
      to_status: nextStatus,
      reason: verification.ok ? undefined : verification.reason,
    };
    audit.push(JSON.stringify(event));

    this.runtime.commit(`${REF_STORE_ORIGIN_PREFIX}:verify`);
    return verification.ok;
  }

  getReference(refId: string): ReferenceEntry | undefined {
    const entry = this.getEntryMap(refId);
    if (!entry) {
      return undefined;
    }
    const record = parseRecord(entry.get("record"));
    if (!record) {
      return undefined;
    }
    const status = readStatus(entry.get("meta")) ?? "active";
    return { record, status };
  }

  getReferencesFromDoc(docId: string): ReferenceEntry[] {
    return this.getAllReferences().filter((entry) => entry.record.source.doc_id === docId);
  }

  getReferencesToDoc(docId: string): ReferenceEntry[] {
    return this.getAllReferences().filter((entry) => entry.record.target.doc_id === docId);
  }

  exportUpdates(since?: ReferenceStoreFrontier): Uint8Array {
    if (!since) {
      return this.runtime.exportSnapshot();
    }
    const frontiers = parseFrontier(since);
    const filteredFrontiers = filterKnownFrontiers(frontiers, this.runtime.doc.frontiers());
    if (filteredFrontiers.length === 0) {
      return this.runtime.exportSnapshot();
    }
    const version = this.runtime.doc.frontiersToVV(filteredFrontiers);
    return this.runtime.exportUpdate(version);
  }

  importUpdates(updates: Uint8Array): void {
    this.runtime.importBytes(updates);
  }

  getFrontier(): ReferenceStoreFrontier {
    const frontiers = this.runtime.doc.frontiers();
    return { loro_frontier: serializeFrontier(frontiers) };
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private ensureRoot(): void {
    const root = this.getRootMap();
    const existingVersion = root.get("lfcc_ref_store_ver");
    if (typeof existingVersion !== "string") {
      root.set("lfcc_ref_store_ver", REF_STORE_VERSION);
    } else if (existingVersion !== REF_STORE_VERSION) {
      throw new ReferenceStoreError(
        "REF_STORE_NOT_CONFIGURED",
        `Reference store version mismatch: ${existingVersion}`
      );
    }
    const existingDomain = root.get("policy_domain_id");
    if (typeof existingDomain !== "string") {
      root.set("policy_domain_id", this.policyDomainId);
    } else if (existingDomain !== this.policyDomainId) {
      throw new ReferenceStoreError(
        "REF_STORE_NOT_CONFIGURED",
        `Reference store policy domain mismatch: ${existingDomain}`
      );
    }
  }

  private ensureRuntimeIdentity(): void {
    const expectedDocId = referenceStoreDocId(this.policyDomainId);
    if (this.runtime.docId !== expectedDocId) {
      throw new ReferenceStoreError(
        "REF_STORE_NOT_CONFIGURED",
        `Reference store doc_id mismatch: ${this.runtime.docId} (expected ${expectedDocId})`
      );
    }
  }

  private getRootMap(): LoroMap {
    return this.runtime.doc.getMap("lfcc_ref_store");
  }

  private getReferencesMap(): LoroMap {
    const root = this.getRootMap();
    return root.getOrCreateContainer("references", new LoroMap());
  }

  private getEntryMap(refId: string): LoroMap | null {
    const references = this.getReferencesMap();
    const entry = references.get(refId);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return references.getOrCreateContainer(refId, new LoroMap());
  }

  private getAllReferences(): ReferenceEntry[] {
    const references = this.getReferencesMap();
    const entries: ReferenceEntry[] = [];
    for (const [key] of references.entries()) {
      if (typeof key !== "string") {
        continue;
      }
      const entryMap = this.getEntryMap(key);
      if (!entryMap) {
        continue;
      }
      const record = parseRecord(entryMap.get("record"));
      if (!record) {
        continue;
      }
      const status = readStatus(entryMap.get("meta")) ?? "active";
      entries.push({ record, status });
    }
    return entries;
  }
}

// ============================================================================
// Parsing helpers
// ============================================================================

function parseRecord(value: unknown): CrossDocReferenceRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const refId = map.get("ref_id");
  const refType = map.get("ref_type");
  const sourceValue = map.get("source");
  const targetValue = map.get("target");
  const createdAt = map.get("created_at_ms");
  const createdByValue = map.get("created_by");
  const version = map.get("v");
  if (
    typeof refId !== "string" ||
    typeof refType !== "string" ||
    typeof createdAt !== "number" ||
    typeof version !== "number"
  ) {
    return null;
  }
  const source = parseSource(sourceValue);
  const target = parseTarget(targetValue);
  const createdBy = parseCreatedBy(createdByValue);
  if (!source || !target || !createdBy) {
    return null;
  }

  const verifiedAt = map.get("verified_at_ms");
  return {
    ref_id: refId,
    ref_type: refType as CrossDocReferenceRecord["ref_type"],
    source,
    target,
    created_at_ms: createdAt,
    created_by: createdBy,
    verified_at_ms: typeof verifiedAt === "number" ? verifiedAt : undefined,
    v: 1,
  };
}

function parseSource(value: unknown): CrossDocReferenceRecord["source"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const docId = map.get("doc_id");
  const blockId = map.get("block_id");
  const startValue = map.get("start");
  const endValue = map.get("end");
  if (typeof docId !== "string" || typeof blockId !== "string") {
    return null;
  }
  const start = parseAnchor(startValue);
  const end = parseAnchor(endValue);
  if (!start || !end) {
    return null;
  }
  const contextHash = map.get("if_match_context_hash");
  return {
    doc_id: documentId(docId),
    block_id: blockId,
    start,
    end,
    if_match_context_hash: typeof contextHash === "string" ? contextHash : undefined,
  };
}

function parseTarget(value: unknown): CrossDocReferenceRecord["target"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const docId = map.get("doc_id");
  const blockId = map.get("block_id");
  const anchorValue = map.get("anchor");
  if (typeof docId !== "string" || typeof blockId !== "string") {
    return null;
  }
  const anchor = parseAnchor(anchorValue);
  if (!anchor) {
    return null;
  }
  return {
    doc_id: documentId(docId),
    block_id: blockId,
    anchor,
  };
}

function parseCreatedBy(value: unknown): CrossDocReferenceRecord["created_by"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const agentId = map.get("agent_id");
  const requestId = map.get("request_id");
  if (typeof agentId !== "string" || typeof requestId !== "string") {
    return null;
  }
  return { agent_id: agentId, request_id: requestId };
}

function parseAnchor(value: unknown): CrossDocReferenceRecord["source"]["start"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const anchor = map.get("anchor");
  const bias = map.get("bias");
  if (typeof anchor !== "string" || (bias !== "left" && bias !== "right")) {
    return null;
  }
  return { anchor, bias };
}

function readStatus(value: unknown): ReferenceStatus | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const map = value as LoroMap;
  const status = map.get("status");
  if (status === "active" || status === "orphan" || status === "deleted") {
    return status;
  }
  return null;
}

function writeRecord(map: LoroMap, record: CrossDocReferenceRecord): void {
  map.set("ref_id", record.ref_id);
  map.set("ref_type", record.ref_type);
  map.set("created_at_ms", record.created_at_ms);
  map.set("v", record.v);
  if (record.verified_at_ms !== undefined) {
    map.set("verified_at_ms", record.verified_at_ms);
  }

  const createdBy = map.getOrCreateContainer("created_by", new LoroMap());
  createdBy.set("agent_id", record.created_by.agent_id);
  createdBy.set("request_id", record.created_by.request_id);

  const source = map.getOrCreateContainer("source", new LoroMap());
  source.set("doc_id", record.source.doc_id);
  source.set("block_id", record.source.block_id);
  if (record.source.if_match_context_hash !== undefined) {
    source.set("if_match_context_hash", record.source.if_match_context_hash);
  }
  const sourceStart = source.getOrCreateContainer("start", new LoroMap());
  sourceStart.set("anchor", record.source.start.anchor);
  sourceStart.set("bias", record.source.start.bias);
  const sourceEnd = source.getOrCreateContainer("end", new LoroMap());
  sourceEnd.set("anchor", record.source.end.anchor);
  sourceEnd.set("bias", record.source.end.bias);

  const target = map.getOrCreateContainer("target", new LoroMap());
  target.set("doc_id", record.target.doc_id);
  target.set("block_id", record.target.block_id);
  const targetAnchor = target.getOrCreateContainer("anchor", new LoroMap());
  targetAnchor.set("anchor", record.target.anchor.anchor);
  targetAnchor.set("bias", record.target.anchor.bias);
}

function parseFrontier(frontier: ReferenceStoreFrontier): LoroFrontiers {
  const entries: LoroFrontiers = [];
  const seen = new Set<string>();
  for (const item of frontier.loro_frontier) {
    const [peer, counterText] = item.split(":");
    const counter = Number(counterText);
    const peerNumber = Number(peer);
    if (!peer || !Number.isFinite(counter) || !Number.isFinite(peerNumber) || seen.has(peer)) {
      continue;
    }
    const peerId = `${peerNumber}` as `${number}`;
    seen.add(peerId);
    entries.push({ peer: peerId, counter });
  }
  return entries;
}

function serializeFrontier(frontiers: Array<{ peer: string | number; counter: number }>): string[] {
  return frontiers
    .map((frontier) => ({ peer: String(frontier.peer), counter: frontier.counter }))
    .sort((a, b) => a.peer.localeCompare(b.peer))
    .map((entry) => `${entry.peer}:${entry.counter}`);
}

function filterKnownFrontiers(frontiers: LoroFrontiers, known: LoroFrontiers): LoroFrontiers {
  const knownPeers = new Set(known.map((entry) => String(entry.peer)));
  return frontiers.filter((entry) => knownPeers.has(entry.peer));
}
