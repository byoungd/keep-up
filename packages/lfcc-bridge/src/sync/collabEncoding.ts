/**
 * Collaboration MVP - Encoding Utilities
 *
 * Base64 encoding/decoding utilities for Loro update bytes.
 */

/**
 * Encode a Uint8Array to base64 string.
 * Works in both browser and Node.js environments.
 */
export function base64Encode(bytes: Uint8Array): string {
  // Browser environment
  if (typeof btoa === "function") {
    return btoa(String.fromCharCode(...bytes));
  }
  // Node.js environment
  return Buffer.from(bytes).toString("base64");
}

/**
 * Decode a base64 string to Uint8Array.
 * Works in both browser and Node.js environments.
 */
export function base64Decode(str: string): Uint8Array {
  // Browser environment
  if (typeof atob === "function") {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js environment
  return new Uint8Array(Buffer.from(str, "base64"));
}
