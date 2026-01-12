/**
 * LFCC v0.9 RC - Encoding Utilities
 *
 * Shared Base64 encoding/decoding utilities for sync operations.
 * Uses chunked processing to prevent stack overflow with large arrays.
 */

const CHUNK_SIZE = 0x8000; // 32KB chunks

function hasBuffer(): boolean {
  return typeof Buffer !== "undefined" && typeof Buffer.from === "function";
}

/**
 * Encode Uint8Array to Base64 string.
 * Handles large arrays by processing in chunks to avoid stack overflow.
 */
export function base64Encode(data: Uint8Array): string {
  if (hasBuffer()) {
    return Buffer.from(data).toString("base64");
  }

  if (typeof btoa === "function") {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(String.fromCharCode(...data.subarray(i, i + CHUNK_SIZE)));
    }
    return btoa(chunks.join(""));
  }

  throw new Error("Base64 encoding not supported in this environment");
}

/**
 * Decode Base64 string to Uint8Array.
 */
export function base64Decode(str: string): Uint8Array {
  if (hasBuffer()) {
    return new Uint8Array(Buffer.from(str, "base64"));
  }

  if (typeof atob === "function") {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }

  throw new Error("Base64 decoding not supported in this environment");
}
