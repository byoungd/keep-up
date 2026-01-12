/**
 * LFCC v0.9 RC - Policy Manifest Hashing
 *
 * Deterministic hash for PolicyManifestV09 using stable serialization.
 */

import { stableStringify } from "./stableStringify";
import type { PolicyManifestV09 } from "./types";

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
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

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return bufferToHex(hashBuffer);
  }

  return simpleHash256(text);
}

export async function computePolicyManifestHash(manifest: PolicyManifestV09): Promise<string> {
  const serialized = stableStringify(manifest);
  return sha256(serialized);
}

export function isManifestHashFormat(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}
