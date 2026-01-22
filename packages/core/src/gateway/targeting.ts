type WindowSize = { left: number; right: number };
type NeighborWindow = { left: number; right: number };

export type WindowHashInput = {
  blockId: string;
  spanStart: number;
  spanEnd: number;
  blockText: string;
  windowSize: WindowSize;
};

export type NeighborHashInput = {
  blockId: string;
  spanStart: number;
  spanEnd: number;
  blockText: string;
  neighborWindow: NeighborWindow;
};

export type StructureHashInput = {
  blockId: string;
  blockType: string;
  parentBlockId?: string | null;
  parentPath?: string | null;
};

export type MatchVector = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

export type RankedCandidate = {
  spanId: string;
  vector: MatchVector;
  distance: number;
};

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const w = new Uint32Array(64);
  let h0 = SHA256_INIT[0];
  let h1 = SHA256_INIT[1];
  let h2 = SHA256_INIT[2];
  let h3 = SHA256_INIT[3];
  let h4 = SHA256_INIT[4];
  let h5 = SHA256_INIT[5];
  let h6 = SHA256_INIT[6];
  let h7 = SHA256_INIT[7];

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

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

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function normalizeSignalText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let result = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const isC0 = code <= 0x1f;
    const isC1 = code >= 0x7f && code <= 0x9f;
    if ((isC0 || isC1) && code !== 0x09 && code !== 0x0a) {
      continue;
    }
    result += normalized[i];
  }
  return result;
}

export function buildSpanWindowCanonical(input: WindowHashInput): string {
  const leftContext = input.blockText.slice(
    Math.max(0, input.spanStart - input.windowSize.left),
    input.spanStart
  );
  const rightContext = input.blockText.slice(
    input.spanEnd,
    Math.min(input.blockText.length, input.spanEnd + input.windowSize.right)
  );

  return [
    "LFCC_SPAN_WINDOW_V1",
    `block_id=${input.blockId}`,
    `left=${normalizeSignalText(leftContext)}`,
    `right=${normalizeSignalText(rightContext)}`,
  ].join("\n");
}

export function computeSpanWindowHash(input: WindowHashInput): string {
  return sha256Hex(buildSpanWindowCanonical(input));
}

export function buildNeighborCanonicals(input: NeighborHashInput): {
  left?: string;
  right?: string;
} {
  const leftNeighbor = input.blockText.slice(
    Math.max(0, input.spanStart - input.neighborWindow.left),
    input.spanStart
  );
  const rightNeighbor = input.blockText.slice(
    input.spanEnd,
    Math.min(input.blockText.length, input.spanEnd + input.neighborWindow.right)
  );

  const result: { left?: string; right?: string } = {};
  if (leftNeighbor.length > 0) {
    result.left = [
      "LFCC_NEIGHBOR_V1",
      `block_id=${input.blockId}`,
      "side=left",
      `text=${normalizeSignalText(leftNeighbor)}`,
    ].join("\n");
  }
  if (rightNeighbor.length > 0) {
    result.right = [
      "LFCC_NEIGHBOR_V1",
      `block_id=${input.blockId}`,
      "side=right",
      `text=${normalizeSignalText(rightNeighbor)}`,
    ].join("\n");
  }
  return result;
}

export function computeNeighborHash(input: NeighborHashInput): { left?: string; right?: string } {
  const canonicals = buildNeighborCanonicals(input);
  return {
    left: canonicals.left ? sha256Hex(canonicals.left) : undefined,
    right: canonicals.right ? sha256Hex(canonicals.right) : undefined,
  };
}

export function buildStructureCanonical(input: StructureHashInput): string {
  const parentBlockId = input.parentBlockId ?? "null";
  const parentPath = input.parentPath ?? "null";

  return [
    "LFCC_BLOCK_SHAPE_V1",
    `block_id=${input.blockId}`,
    `type=${input.blockType}`,
    `parent_block_id=${parentBlockId}`,
    `parent_path=${parentPath}`,
  ].join("\n");
}

export function computeStructureHash(input: StructureHashInput): string {
  return sha256Hex(buildStructureCanonical(input));
}

export function compareMatchVectors(a: MatchVector, b: MatchVector): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] ? -1 : 1;
    }
  }
  return 0;
}

export function rankCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((a, b) => {
    const vectorOrder = compareMatchVectors(a.vector, b.vector);
    if (vectorOrder !== 0) {
      return vectorOrder;
    }
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.spanId.localeCompare(b.spanId);
  });
}
