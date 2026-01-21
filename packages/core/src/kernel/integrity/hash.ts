/**
 * LFCC v0.9 RC - Hash Computation
 * @see docs/product/Local-First_Collaboration_Contract_v0.9_RC.md §6.2
 */

import {
  type CanonBlock,
  type CanonicalizerPolicyV2,
  DEFAULT_CANONICALIZER_POLICY,
  isCanonBlock,
  isCanonText,
  sortMarks,
} from "../canonicalizer/index.js";
import type {
  BlockDigestEntry,
  BlockDigestInput,
  BlockInlineSegment,
  ChainData,
  ChainHashResult,
  ContextHashResult,
  DocumentChecksumPayload,
  SpanData,
} from "./types.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: Control chars must be stripped for checksum inputs
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B-\u001F\u007F\u0080-\u009F]/g;
const BLOCK_HASH_PREFIX = "LFCC_BLOCK_V1\n";
const DOC_HASH_PREFIX = "LFCC_DOC_V1\n";

/**
 * Convert string to UTF-8 bytes
 */
function stringToBytes(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8");
  }
  return new TextEncoder().encode(str);
}

/**
 * Normalize text for hashing:
 * - Normalize CRLF/CR to LF
 * - NFC normalization
 * - Strip control chars except Tab/LF
 */
function normalizeHashText(text: string): string {
  const normalizedLineEndings = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const nfc = normalizedLineEndings.normalize("NFC");
  return nfc.replace(CONTROL_CHAR_REGEX, "");
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function simpleHash256(str: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const part = simpleHash(`${i}:${str}`).padStart(16, "0");
    parts.push(part);
  }
  return parts.join("");
}

/**
 * Compute SHA-256 hash (prefer Web Crypto, fallback to Node, then simple hash)
 */
async function sha256Hex(data: string): Promise<string> {
  const bytes = stringToBytes(data);
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined;
  if (subtle) {
    const hashBuffer = await subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(hashBuffer));
  }

  try {
    const nodeCrypto = await import("node:crypto");
    const hash = nodeCrypto.createHash("sha256");
    hash.update(bytes);
    return hash.digest("hex");
  } catch {
    // fall through
  }

  return simpleHash256(data);
}

/**
 * Stable JSON stringify with sorted object keys (JCS-like)
 */
function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = (v as Record<string, unknown>)[key];
            return acc;
          },
          {} as Record<string, unknown>
        );
    }
    return v;
  });
}

function normalizeAttrs(
  attrs: Record<string, unknown>,
  omitKeys: Set<string> = new Set()
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs).sort()) {
    if (omitKeys.has(key)) {
      continue;
    }
    const value = attrs[key];
    if (value === undefined || value === null) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeInlineSegment(
  segment: BlockInlineSegment,
  policy: CanonicalizerPolicyV2
): BlockInlineSegment {
  const marks = sortMarks(new Set(segment.marks), policy);
  const href = segment.attrs?.href;
  const hasLink = marks.includes("link");
  return {
    text: normalizeHashText(segment.text),
    marks,
    attrs: hasLink && href ? { href } : {},
  };
}

/**
 * Compute context hash for a span
 *
 * Format (LFCC v0.9 RC §6.2):
 * ```
 * LFCC_SPAN_V2
 * block_id=<block_id>
 * text=<exact UTF-16 slice at creation, LF-normalized>
 * ```
 */
export async function computeContextHash(span: SpanData): Promise<ContextHashResult> {
  const normalizedText = normalizeHashText(span.text);
  const input = `LFCC_SPAN_V2\nblock_id=${span.block_id}\ntext=${normalizedText}`;
  const hash = await sha256Hex(input);
  return { span_id: span.span_id, hash };
}

/**
 * Compute chain hash for an annotation's span chain
 *
 * Format (LFCC v0.9 RC §6.2):
 * ```
 * LFCC_CHAIN_V2
 * policy=<kind>:<max_intervening_blocks>
 * blocks=<block_id_1>,<block_id_2>,...,<block_id_n>
 * ```
 */
export async function computeChainHash(chain: ChainData): Promise<ChainHashResult> {
  const policyStr = `${chain.policy_kind}:${chain.max_intervening_blocks}`;
  const blocksStr = chain.block_ids.join(",");
  const input = `LFCC_CHAIN_V2\npolicy=${policyStr}\nblocks=${blocksStr}`;
  const hash = await sha256Hex(input);
  return { hash, block_ids: chain.block_ids };
}

/**
 * Verify a context hash matches expected value
 */
export async function verifyContextHash(span: SpanData, expectedHash: string): Promise<boolean> {
  const result = await computeContextHash(span);
  return result.hash === expectedHash;
}

/**
 * Verify a chain hash matches expected value
 */
export async function verifyChainHash(chain: ChainData, expectedHash: string): Promise<boolean> {
  const result = await computeChainHash(chain);
  return result.hash === expectedHash;
}

/**
 * Batch compute context hashes for multiple spans
 */
export async function computeContextHashBatch(spans: SpanData[]): Promise<ContextHashResult[]> {
  return Promise.all(spans.map(computeContextHash));
}

/**
 * Compute LFCC_BLOCK_V1 digest for a single block
 */
export async function computeBlockDigest(
  input: BlockDigestInput,
  policy: CanonicalizerPolicyV2 = DEFAULT_CANONICALIZER_POLICY
): Promise<string> {
  const payload = {
    block_id: input.block_id,
    type: input.type,
    attrs: normalizeAttrs(input.attrs ?? {}),
    inline: (input.inline ?? []).map((segment) => normalizeInlineSegment(segment, policy)),
    children: [...(input.children ?? [])],
  };
  const serialized = stableJsonStringify(payload);
  return sha256Hex(`${BLOCK_HASH_PREFIX}${serialized}`);
}

/**
 * Compute LFCC_DOC_V1 checksum from block digests (Tier 1)
 */
export async function computeDocumentChecksum(payload: DocumentChecksumPayload): Promise<string> {
  const serialized = stableJsonStringify({
    blocks: payload.blocks.map((b) => ({ block_id: b.block_id, digest: b.digest })),
  });
  return sha256Hex(`${DOC_HASH_PREFIX}${serialized}`);
}

/**
 * Compute LFCC_DOC_V1 checksum by recomputing block digests from canonical nodes (Tier 2)
 */
export async function computeDocumentChecksumTier2(
  root: CanonBlock,
  policy: CanonicalizerPolicyV2 = DEFAULT_CANONICALIZER_POLICY
): Promise<{ checksum: string; blocks: BlockDigestEntry[] }> {
  const { entries } = await computeBlockDigests(root, policy);
  const checksum = await computeDocumentChecksum({ blocks: entries });
  return { checksum, blocks: entries };
}

async function computeBlockDigests(
  block: CanonBlock,
  policy: CanonicalizerPolicyV2
): Promise<{ digest: string; entries: BlockDigestEntry[] }> {
  const childBlocks = (block.children ?? []).filter(isCanonBlock) as CanonBlock[];
  const childResults: Array<{ digest: string; entries: BlockDigestEntry[] }> = [];
  for (const child of childBlocks) {
    childResults.push(await computeBlockDigests(child, policy));
  }

  const childDigests = childResults.map((result) => result.digest);
  const inlineSegments = extractInlineSegments(block, policy);
  const blockId = getBlockId(block);

  const digest = await computeBlockDigest(
    {
      block_id: blockId,
      type: block.type,
      attrs: normalizeAttrs(block.attrs, new Set(["block_id"])),
      inline: inlineSegments,
      children: childDigests,
    },
    policy
  );

  const entries: BlockDigestEntry[] = [{ block_id: blockId, digest }];
  for (const child of childResults) {
    entries.push(...child.entries);
  }

  return { digest, entries };
}

function getBlockId(block: CanonBlock): string {
  const rawId = block.attrs?.block_id;
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new Error("CanonBlock is missing required block_id for checksum computation");
  }
  return rawId;
}

function extractInlineSegments(
  block: CanonBlock,
  policy: CanonicalizerPolicyV2
): BlockInlineSegment[] {
  const segments: BlockInlineSegment[] = [];
  for (const child of block.children ?? []) {
    if (isCanonText(child)) {
      segments.push(
        normalizeInlineSegment(
          {
            text: child.text,
            marks: child.marks ?? [],
            attrs: child.attrs?.href ? { href: child.attrs.href } : {},
          },
          policy
        )
      );
    }
  }
  return segments;
}
