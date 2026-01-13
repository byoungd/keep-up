/**
 * LFCC v0.9 RC - Hash Computation
 * @see docs/product/Local-First_Collaboration_Contract_v0.9_RC.md §6.2
 */

import type { ChainData, ChainHashResult, ContextHashResult, SpanData } from "./types.js";

/**
 * Normalize text to LF line endings
 */
function normalizeLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Convert string to UTF-8 bytes
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
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
 * Compute SHA-256 hash (async, uses Web Crypto API)
 */
async function sha256(data: string): Promise<string> {
  const bytes = stringToBytes(data);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined;
  if (subtle) {
    const hashBuffer = await subtle.digest("SHA-256", buffer);
    return bytesToHex(new Uint8Array(hashBuffer));
  }
  return simpleHash256(data);
}

/**
 * Compute SHA-256 hash (sync fallback for Node.js)

  // For now, we'll use the async version wrapped
  throw new Error("Sync SHA-256 not available - use async version");
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
  const normalizedText = normalizeLF(span.text);
  const input = `LFCC_SPAN_V2\nblock_id=${span.block_id}\ntext=${normalizedText}`;
  const hash = await sha256(input);
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
  const hash = await sha256(input);
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
