/**
 * LFCC v0.9 RC - Unified Anchor Codec
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/22_Anchor_Upgrade_Path.md
 *
 * Provides unified anchor encoding/decoding across core and bridge packages.
 * Supports versioned format with integrity (legacy CRC32 + new HMAC-SHA256).
 */

import { getNativeAnchorCodec, type NativeAnchorCodecBinding } from "@ku0/anchor-codec-rs";

// ============================================================================
// Constants
// ============================================================================

/** Current codec version (HMAC-SHA256, versioned binary) */
export const CODEC_VERSION = 3;

/** Legacy codec versions for compatibility */
export const LEGACY_VERSION_ADLER32_JSON = 0; // Core legacy (base64 JSON)
export const LEGACY_VERSION_CRC32_BINARY = 1; // Bridge legacy (versioned binary)

/** HMAC tag length (bytes, truncated) */
const HMAC_TAG_LENGTH = 16;
/** CRC checksum length in bytes (legacy) */
const CHECKSUM_LENGTH = 4;
/** Default HMAC key (placeholder until policy wiring) */
const DEFAULT_HMAC_KEY = "lfcc-anchor-hmac-key";

// ============================================================================
// Types
// ============================================================================

export type AnchorData = {
  blockId: string;
  offset: number;
  bias: "before" | "after";
};

export type EncodedAnchor = {
  /** Encoded bytes (versioned format) */
  bytes: Uint8Array;
  /** String representation for core compatibility */
  base64: string;
};

// ============================================================================
// Helpers (UTF-8, concat)
// ============================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function resolveNativeAnchorCodec(): NativeAnchorCodecBinding | null {
  return getNativeAnchorCodec();
}

function toNativeBytes(bytes: Uint8Array): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes);
  }
  return bytes;
}

function utf8Encode(str: string): Uint8Array {
  return textEncoder.encode(str);
}

function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ============================================================================
// SHA-256 + HMAC (sync, portable)
// ============================================================================

// Minimal SHA-256 implementation (synchronous, integer-based)
function sha256(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const msg = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  msg.set(message);
  msg[message.length] = 0x80;

  const bitLen = message.length * 8;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 4, bitLen >>> 0, false);
  view.setUint32(msg.length - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let i = 0; i < msg.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ror(w[j - 15], 7) ^ ror(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = ror(w[j - 2], 17) ^ ror(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let j = 0; j < 64; j++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const dvOut = new DataView(out.buffer);
  dvOut.setUint32(0, h0, false);
  dvOut.setUint32(4, h1, false);
  dvOut.setUint32(8, h2, false);
  dvOut.setUint32(12, h3, false);
  dvOut.setUint32(16, h4, false);
  dvOut.setUint32(20, h5, false);
  dvOut.setUint32(24, h6, false);
  dvOut.setUint32(28, h7, false);
  return out;
}

function ror(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = sha256(k);
  }
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(k);
    k = padded;
  }

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const keyByte = k[i] ?? 0;
    oKeyPad[i] = keyByte ^ 0x5c;
    iKeyPad[i] = keyByte ^ 0x36;
  }

  const inner = sha256(concatBytes(iKeyPad, msg));
  const outer = sha256(concatBytes(oKeyPad, inner));
  return outer;
}

function computeHmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const native = resolveNativeAnchorCodec();
  if (native) {
    try {
      return native.hmacSha256(toNativeBytes(key), toNativeBytes(msg));
    } catch {
      // Fall back to JS HMAC if native fails.
    }
  }
  return hmacSha256(key, msg);
}

function defaultHmacKey(): Uint8Array {
  return utf8Encode(DEFAULT_HMAC_KEY);
}

// ============================================================================
// CRC32 Checksum (Shared Implementation)
// ============================================================================

/**
 * Compute CRC32 checksum
 * Uses standard polynomial 0xEDB88320
 */
export function computeCRC32(data: Uint8Array): Uint8Array {
  const native = resolveNativeAnchorCodec();
  if (native) {
    try {
      return native.crc32(toNativeBytes(data));
    } catch {
      // Fall back to JS CRC32 if native fails.
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (byte === undefined) {
      continue;
    }
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const checksum = new Uint8Array(CHECKSUM_LENGTH);
  checksum[0] = (crc >>> 24) & 0xff;
  checksum[1] = (crc >>> 16) & 0xff;
  checksum[2] = (crc >>> 8) & 0xff;
  checksum[3] = crc & 0xff;
  return checksum;
}

/**
 * Verify CRC32 checksum
 */
export function verifyCRC32(data: Uint8Array, expected: Uint8Array): boolean {
  const native = resolveNativeAnchorCodec();
  if (native) {
    try {
      return native.verifyCrc32(toNativeBytes(data), toNativeBytes(expected));
    } catch {
      // Fall back to JS CRC32 verification if native fails.
    }
  }

  const computed = computeCRC32(data);
  if (computed.length !== expected.length) {
    return false;
  }
  for (let i = 0; i < computed.length; i++) {
    if (computed[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Adler32 Checksum (Legacy Core Compatibility)
// ============================================================================

/**
 * Compute Adler32-like checksum (legacy core format)
 */
function computeAdler32(str: string): string {
  const native = resolveNativeAnchorCodec();
  if (native) {
    try {
      return native.adler32(str);
    } catch {
      // Fall back to JS Adler32 if native fails.
    }
  }

  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < str.length; i++) {
    a = (a + str.charCodeAt(i)) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a).toString(16);
}

// ============================================================================
// V2/V3 Encoding (Unified Format)
// ============================================================================

/**
 * Encode anchor data using current format (versioned, HMAC-protected)
 *
 * V3 Format (current):
 * [version: 1 byte][blockId length: 2 bytes][blockId: variable][offset: 4 bytes][bias: 1 byte][hmac: 16 bytes (truncated)]
 */
export function encodeAnchorV2(data: AnchorData): EncodedAnchor {
  const blockIdBytes = utf8Encode(data.blockId);
  const blockIdLen = blockIdBytes.length;

  if (blockIdLen > 0xffff) {
    throw new Error("blockId too long");
  }
  if (!Number.isFinite(data.offset) || data.offset < 0 || data.offset > 0x7fffffff) {
    throw new Error("offset out of range");
  }

  // Calculate total size
  const dataSize = 1 + 2 + blockIdLen + 4 + 1; // version + len + blockId + offset + bias
  const totalSize = dataSize + HMAC_TAG_LENGTH;

  const buffer = new Uint8Array(totalSize);
  let pos = 0;

  // Version
  buffer[pos++] = CODEC_VERSION;

  // Block ID length (big-endian 16-bit)
  buffer[pos++] = (blockIdLen >>> 8) & 0xff;
  buffer[pos++] = blockIdLen & 0xff;

  // Block ID
  buffer.set(blockIdBytes, pos);
  pos += blockIdLen;

  // Offset (big-endian 32-bit)
  buffer[pos++] = (data.offset >>> 24) & 0xff;
  buffer[pos++] = (data.offset >>> 16) & 0xff;
  buffer[pos++] = (data.offset >>> 8) & 0xff;
  buffer[pos++] = data.offset & 0xff;

  // Bias (0 = before, 1 = after)
  buffer[pos++] = data.bias === "after" ? 1 : 0;

  // Compute HMAC over data portion (excluding tag)
  const dataBytes = buffer.slice(0, pos);
  const hmac = computeHmacSha256(defaultHmacKey(), dataBytes).slice(0, HMAC_TAG_LENGTH);
  buffer.set(hmac, pos);

  // Generate base64 string
  const base64 = btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { bytes: buffer, base64 };
}

/**
 * Decode anchor data from V2 format
 * Returns null if checksum validation fails (fail-closed)
 */
export function decodeAnchorV2(encoded: Uint8Array | string): AnchorData | null {
  const bytes = typeof encoded === "string" ? decodeBase64Bytes(encoded) : encoded;
  if (!bytes) {
    return null;
  }

  return decodeVersionedAnchor(bytes, encoded);
}

function decodeBase64Bytes(encoded: string): Uint8Array | null {
  try {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeVersionedAnchor(
  bytes: Uint8Array,
  encoded?: Uint8Array | string
): AnchorData | null {
  if (bytes.length === 0) {
    return null;
  }

  const version = bytes[0];

  if (version === LEGACY_VERSION_CRC32_BINARY) {
    return decodeLegacyBridgeFormat(bytes);
  }

  if (version !== CODEC_VERSION) {
    if (typeof encoded === "string") {
      return decodeLegacyCoreFormat(encoded);
    }
    return null;
  }

  // Minimum size: version(1) + len(2) + offset(4) + bias(1) + tag(16) = 24 (with 0-length blockId)
  if (bytes.length < 1 + 2 + 4 + 1 + HMAC_TAG_LENGTH) {
    return null;
  }

  return decodeCurrentFormat(bytes);
}

function decodeCurrentFormat(bytes: Uint8Array): AnchorData | null {
  const tagStart = bytes.length - HMAC_TAG_LENGTH;
  const dataBytes = bytes.slice(0, tagStart);
  const storedTag = bytes.slice(tagStart);

  if (storedTag.length !== HMAC_TAG_LENGTH) {
    return null;
  }

  const expected = computeHmacSha256(defaultHmacKey(), dataBytes).slice(0, HMAC_TAG_LENGTH);
  for (let i = 0; i < HMAC_TAG_LENGTH; i++) {
    if (storedTag[i] !== expected[i]) {
      return null;
    }
  }

  if (dataBytes.length < 1 + 2 + 4 + 1) {
    return null;
  }

  let pos = 1;
  const blockIdLen = ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0);
  pos += 2;

  if (pos + blockIdLen + 5 > dataBytes.length) {
    return null;
  }

  const blockIdBytes = bytes.slice(pos, pos + blockIdLen);
  const blockId = utf8Decode(blockIdBytes);
  pos += blockIdLen;

  const offset =
    ((bytes[pos] ?? 0) << 24) |
    ((bytes[pos + 1] ?? 0) << 16) |
    ((bytes[pos + 2] ?? 0) << 8) |
    (bytes[pos + 3] ?? 0);
  pos += 4;

  if (offset < 0) {
    return null;
  }

  const bias: "before" | "after" = bytes[pos] === 1 ? "after" : "before";

  return { blockId, offset, bias };
}

// ============================================================================
// Legacy Format Decoders (Compatibility)
// ============================================================================

/**
 * Decode legacy core format (Adler32 JSON base64)
 */
function decodeLegacyCoreFormat(base64: string): AnchorData | null {
  try {
    let b64 = base64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) {
      b64 += "=";
    }
    const decoded = atob(b64);
    const parsed = safeJsonParse(decoded);
    if (!parsed) {
      return decodeLegacyPlainFormat(decoded);
    }

    if (typeof parsed !== "object" || !("c" in parsed)) {
      return null;
    }

    const payload = parsed as { c?: string; blockId?: unknown; offset?: unknown; bias?: unknown };
    if (typeof payload.c !== "string" || typeof payload.blockId !== "string") {
      return null;
    }
    if (typeof payload.offset !== "number" || !Number.isFinite(payload.offset)) {
      return null;
    }

    // Verify Adler32 checksum
    const checkInput = `${payload.blockId}|${payload.offset}|${payload.bias ?? "after"}`;
    const expected = computeAdler32(checkInput);
    if (payload.c !== expected) {
      return null;
    }

    return {
      blockId: payload.blockId,
      offset: payload.offset,
      bias: payload.bias === "before" ? "before" : "after",
    };
  } catch {
    return null;
  }
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeLegacyPlainFormat(decoded: string): AnchorData | null {
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code < 32 || code === 127) {
      return null;
    }
  }

  const parts = decoded.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const blockId = parts[0] ?? "";
  if (blockId.length === 0) {
    return null;
  }

  const offsetStr = parts[parts.length - 1] ?? "";
  const offset = Number.parseInt(offsetStr, 10);
  if (!Number.isFinite(offset) || offset < 0) {
    return null;
  }

  return {
    blockId,
    offset,
    bias: "after",
  };
}

/**
 * Decode legacy bridge format (CRC32 versioned binary without anchor data)
 * Note: Bridge format encodes Loro Cursor, not AnchorData directly
 * This returns null as we can't decode Loro cursors here
 */
function decodeLegacyBridgeFormat(_bytes: Uint8Array): AnchorData | null {
  // Bridge format contains Loro cursor bytes, not AnchorData
  // This requires Loro runtime to decode, so we return null
  // The bridge should use its own decoder for this format
  return null;
}

// ============================================================================
// Extension Keys (Reserved for v0.9 RC)
// ============================================================================

/**
 * Reserved extension keys for anchor upgrades
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/02_Policy_Manifest_Schema.md
 */
export const ANCHOR_EXTENSION_KEYS = {
  /** Anchor codec version to use */
  ANCHOR_CODEC_VERSION: "lfcc.anchor.codec_version",
  /** Checksum algorithm preference */
  ANCHOR_CHECKSUM_ALG: "lfcc.anchor.checksum_alg",
  /** Enable HMAC upgrade (future) */
  ANCHOR_HMAC_ENABLED: "lfcc.anchor.hmac_enabled",
} as const;
