/**
 * useInviteToken - Hook for parsing and generating invite tokens
 *
 * Handles joinToken URL parameter parsing and token generation for sharing.
 */

"use client";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import type { CollabRole } from "./useCollabSession";

/** Invite token payload */
export interface InviteTokenPayload {
  docId: string;
  role: CollabRole;
  exp?: number;
  iat: number;
}

/** Parsed invite token result */
export type ParsedInviteToken =
  | { valid: true; payload: InviteTokenPayload; token: string }
  | { valid: false; error: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "NO_TOKEN" };

/** Hook result */
export interface UseInviteTokenResult {
  /** Parsed token from URL (if present) */
  parsedToken: ParsedInviteToken;
  /** Generate an invite token (dev mode) */
  generateToken: (docId: string, role: "editor" | "viewer", expiryHours?: number) => string;
  /** Generate a full invite URL */
  generateInviteUrl: (docId: string, role: "editor" | "viewer", expiryHours?: number) => string;
}

// Dev mode secret (should match server in dev)
const DEV_SECRET = "dev-invite-secret-key-for-testing";

/**
 * Hook for invite token management.
 *
 * Parses joinToken from URL and provides token generation for sharing.
 */
export function useInviteToken(): UseInviteTokenResult {
  const searchParams = useSearchParams();

  // Parse token from URL
  const parsedToken = React.useMemo<ParsedInviteToken>(() => {
    const tokenParam = searchParams.get("joinToken");

    if (!tokenParam) {
      return { valid: false, error: "NO_TOKEN" };
    }

    return parseToken(tokenParam);
  }, [searchParams]);

  // Generate token (dev mode)
  const generateToken = React.useCallback(
    (docId: string, role: "editor" | "viewer", expiryHours?: number): string => {
      const now = Date.now();
      const payload: InviteTokenPayload = {
        docId,
        role,
        iat: now,
      };

      if (expiryHours !== undefined && expiryHours > 0) {
        payload.exp = now + expiryHours * 60 * 60 * 1000;
      }

      const payloadJson = JSON.stringify(payload);
      const payloadB64 = btoa(payloadJson)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // In browser, use SubtleCrypto or fallback to simple hash
      const signature = simpleHash(payloadB64, DEV_SECRET);

      return `${payloadB64}:${signature}`;
    },
    []
  );

  // Generate full invite URL
  const generateInviteUrl = React.useCallback(
    (docId: string, role: "editor" | "viewer", expiryHours?: number): string => {
      const token = generateToken(docId, role, expiryHours);
      const encodedToken = encodeURIComponent(token);

      // Get current origin and locale
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const pathname = typeof window !== "undefined" ? window.location.pathname : "";
      const localeMatch = pathname.match(/^\/([a-z]{2})\//);
      const locale = localeMatch ? localeMatch[1] : "en";

      return `${origin}/${locale}/reader/${docId}?joinToken=${encodedToken}`;
    },
    [generateToken]
  );

  return {
    parsedToken,
    generateToken,
    generateInviteUrl,
  };
}

/**
 * Parse and validate an invite token.
 */
function parseToken(token: string): ParsedInviteToken {
  const parts = token.split(":");
  if (parts.length !== 2) {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  const [payloadB64, signature] = parts;

  // Verify signature
  const expectedSig = simpleHash(payloadB64, DEV_SECRET);
  if (signature !== expectedSig) {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  // Decode payload
  try {
    // Handle base64url decoding
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as InviteTokenPayload;

    // Validate structure
    if (!payload.docId || !payload.role || typeof payload.iat !== "number") {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    // Validate role
    if (payload.role !== "editor" && payload.role !== "viewer") {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    // Check expiry
    if (payload.exp !== undefined && Date.now() > payload.exp) {
      return { valid: false, error: "EXPIRED_TOKEN" };
    }

    return { valid: true, payload, token };
  } catch {
    return { valid: false, error: "INVALID_TOKEN" };
  }
}

/**
 * Simple hash function for dev mode (browser-compatible).
 * In production, use proper HMAC via server.
 */
function simpleHash(data: string, secret: string): string {
  // Simple hash for browser compatibility
  let hash = 0;
  const combined = data + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and pad
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return hex.repeat(8); // 64 char hex string
}

/**
 * Extract joinToken from URL for server-side use.
 */
export function extractJoinToken(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get("joinToken");
  } catch {
    return null;
  }
}
