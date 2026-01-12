/**
 * LFCC v0.9 RC - Protocol Version Guard
 *
 * Validates client protocol versions and rejects deprecated versions.
 */

/** Supported protocol versions (newest first) */
export const SUPPORTED_PROTOCOL_VERSIONS = ["1.0.0"] as const;

/** Deprecated versions that will be rejected */
export const DEPRECATED_VERSIONS = ["0.8.0", "0.9.0-beta", "0.9.0-alpha"] as const;

/** Minimum supported version */
export const MIN_SUPPORTED_VERSION = "1.0.0";

/**
 * Check if a protocol version is supported.
 */
export function isVersionSupported(version: string): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(
    version as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number]
  );
}

/**
 * Check if a protocol version is explicitly deprecated.
 */
export function isVersionDeprecated(version: string): boolean {
  return DEPRECATED_VERSIONS.includes(version as (typeof DEPRECATED_VERSIONS)[number]);
}

/**
 * Create an error message for version mismatch.
 */
export function createVersionMismatchError(clientVersion: string): string {
  if (isVersionDeprecated(clientVersion)) {
    return `Protocol version ${clientVersion} is deprecated. Please upgrade to ${MIN_SUPPORTED_VERSION} or later.`;
  }
  return `Protocol version ${clientVersion} is not supported. Supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}`;
}

/**
 * Validate protocol version from handshake.
 * Returns null if valid, or error message if invalid.
 */
export function validateProtocolVersion(version: string): string | null {
  if (isVersionSupported(version)) {
    return null;
  }
  return createVersionMismatchError(version);
}
