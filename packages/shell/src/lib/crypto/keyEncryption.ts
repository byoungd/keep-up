/**
 * API Key Encryption Utilities
 *
 * Uses Web Crypto API to encrypt/decrypt API keys before localStorage storage.
 * This provides defense-in-depth - not perfect security (client-side limitation),
 * but significantly better than plaintext storage.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT = "keepup-api-key-salt-v1"; // Fixed salt for key derivation

/**
 * Derives a CryptoKey from a device fingerprint.
 * Uses PBKDF2 for key derivation.
 */
async function deriveKey(fingerprint: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(fingerprint),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Generates a device fingerprint for key derivation.
 * Combines multiple browser properties for uniqueness.
 */
function getDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    return "server-side-fallback";
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? "unknown",
  ];

  return components.join("|");
}

/**
 * Encrypts a plaintext API key.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext) {
    return "";
  }

  try {
    const fingerprint = getDeviceFingerprint();
    const key = await deriveKey(fingerprint);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoder.encode(plaintext)
    );

    // Combine IV + ciphertext into single array
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Encode as base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    if (typeof reportError === "function") {
      const err = error instanceof Error ? error : new Error(String(error));
      reportError(err);
    }
    // Fallback: return empty to avoid storing plaintext
    return "";
  }
}

/**
 * Decrypts an encrypted API key.
 * Expects a base64-encoded string containing IV + ciphertext.
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  if (!encrypted) {
    return "";
  }

  try {
    const fingerprint = getDeviceFingerprint();
    const key = await deriveKey(fingerprint);

    // Decode from base64
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (typeof reportError === "function") {
      const err = error instanceof Error ? error : new Error(String(error));
      reportError(err);
    }
    // Return empty on failure - key may be from different device
    return "";
  }
}

/**
 * Checks if a string appears to be encrypted (base64 with sufficient length).
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 20) {
    return false;
  }

  // Check if it's valid base64 and has minimum length for IV + some content
  try {
    const decoded = atob(value);
    return decoded.length > IV_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Masks an API key for display (shows first and last 4 characters).
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 8) {
    return "••••••••";
  }
  const first = apiKey.slice(0, 4);
  const last = apiKey.slice(-4);
  return `${first}${"•".repeat(Math.min(apiKey.length - 8, 20))}${last}`;
}
