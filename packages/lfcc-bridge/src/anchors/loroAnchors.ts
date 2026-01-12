import { Cursor, type LoroDoc, type LoroText, type Side } from "loro-crdt";

export type AnchorBias = "left" | "right";
export type EncodedAnchor = Uint8Array;

export type ResolvedAnchor = {
  offset: number;
  side: Side;
  cursor: Cursor;
};

/**
 * Anchor with integrity tag
 * Format: [version: 1 byte][cursor bytes][hmac: 16 bytes (truncated SHA-256)]
 * Returned as bytes; `encodeAnchorBase64` provides strict, URL-safe base64.
 */
const ANCHOR_VERSION = 2;
const HMAC_TAG_LENGTH = 16;
const DEFAULT_HMAC_KEY = "lfcc-anchor-hmac-key";

const textEncoder = new TextEncoder();

const hmacKeyBytes = textEncoder.encode(DEFAULT_HMAC_KEY);

/** Right-rotate */
function ror(value: number, amount: number): number {
  return ((value >>> amount) | (value << (32 - amount))) >>> 0;
}

/** Minimal SHA-256 (sync) */
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

  const hash = new Uint8Array(32);
  const viewOut = new DataView(hash.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, idx) => {
    viewOut.setUint32(idx * 4, value, false);
  });
  return hash;
}

/** HMAC-SHA256 (sync) */
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
    oKeyPad[i] = 0x5c ^ keyByte;
    iKeyPad[i] = 0x36 ^ keyByte;
  }

  const inner = sha256(new Uint8Array([...iKeyPad, ...msg]));
  return sha256(new Uint8Array([...oKeyPad, ...inner]));
}

function computeTag(data: Uint8Array): Uint8Array {
  return hmacSha256(hmacKeyBytes, data).slice(0, HMAC_TAG_LENGTH);
}

function encodeBase64(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  const b64 =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(base64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9\-_]+=?=?$/.test(base64)) {
    return null;
  }
  let normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) {
    normalized += "=";
  }
  try {
    const binary =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Encode anchor with integrity checksum
 */
export function encodeAnchor(cursor: Cursor): EncodedAnchor {
  const cursorBytes = cursor.encode();
  const version = new Uint8Array([ANCHOR_VERSION]);
  const data = new Uint8Array(version.length + cursorBytes.length);
  data.set(version, 0);
  data.set(cursorBytes, version.length);
  const tag = computeTag(data);
  const encoded = new Uint8Array(data.length + tag.length);
  encoded.set(data, 0);
  encoded.set(tag, data.length);
  return encoded;
}

/**
 * Decode anchor and validate integrity checksum
 *
 * **Security Note:** This function automatically validates anchor integrity
 * by checking the embedded checksum. Invalid anchors (corrupted, tampered,
 * or malformed) will return null, enforcing fail-closed security.
 *
 * @returns Cursor if valid, null if checksum validation fails
 */
export function decodeAnchor(bytes: EncodedAnchor | string): Cursor | null {
  const resolved =
    typeof bytes === "string" ? decodeBase64(bytes) : bytes instanceof Uint8Array ? bytes : null;
  if (!resolved || resolved.length < 1 + HMAC_TAG_LENGTH) {
    return null;
  }

  const version = resolved[0];
  if (version !== ANCHOR_VERSION) {
    return null;
  }

  const tag = resolved.slice(resolved.length - HMAC_TAG_LENGTH);
  const data = resolved.slice(0, resolved.length - HMAC_TAG_LENGTH);
  const cursorBytes = data.slice(1);

  const expectedTag = computeTag(data);
  if (!checksumsEqual(tag, expectedTag)) {
    return null;
  }

  try {
    return Cursor.decode(cursorBytes);
  } catch {
    return null;
  }
}

/**
 * Validate anchor integrity without decoding
 */
export function validateAnchorIntegrity(anchor: EncodedAnchor | string): boolean {
  return decodeAnchor(anchor) !== null;
}

/**
 * Encode anchor and return URL-safe base64 string (preferred for transport)
 */
export function encodeAnchorBase64(cursor: Cursor): string {
  return encodeBase64(encodeAnchor(cursor));
}

/**
 * Compare two checksums
 */
function checksumsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function resolveAnchor(doc: LoroDoc, cursor: Cursor): ResolvedAnchor | null {
  const result = doc.getCursorPos(cursor);
  if (!result) {
    return null;
  }

  return {
    offset: result.offset,
    side: result.side,
    cursor: result.update ?? cursor,
  };
}

export function cursorFromOffset(text: LoroText, offset: number, bias: AnchorBias): Cursor | null {
  const side: Side = bias === "right" ? 1 : -1;
  return text.getCursor(offset, side) ?? null;
}

export function encodeAnchorFromOffset(
  text: LoroText,
  offset: number,
  bias: AnchorBias
): EncodedAnchor | null {
  const cursor = cursorFromOffset(text, offset, bias);
  if (!cursor) {
    return null;
  }

  return encodeAnchor(cursor);
}
