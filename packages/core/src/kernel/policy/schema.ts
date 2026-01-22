/**
 * LFCC v0.9 RC - Policy Manifest Schema Validation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/02_Policy_Manifest_Schema.md
 *
 * P0.1: Strict schema validation - reject unknown top-level fields unless in extensions
 */

import type { PolicyManifestV09 } from "./types.js";

/**
 * Known top-level fields in PolicyManifestV09
 * P0.1: All fields must be in this list OR in extensions
 */
const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "lfcc_version",
  "policy_id",
  "coords",
  "anchor_encoding",
  "structure_mode",
  "block_id_policy",
  "chain_policy",
  "partial_policy",
  "integrity_policy",
  "canonicalizer_policy",
  "history_policy",
  "ai_sanitization_policy",
  "ai_native_policy",
  "markdown_policy",
  "relocation_policy",
  "dev_tooling_policy",
  "capabilities",
  "conformance_kit_policy",
  "extensions",
  "v",
]);

/**
 * Schema validation error
 */
export type SchemaValidationError = {
  field: string;
  message: string;
  detail?: string;
};

/**
 * Schema validation result
 */
export type SchemaValidationResult =
  | { valid: true }
  | { valid: false; errors: SchemaValidationError[] };

/**
 * Validate policy manifest schema
 * P0.1: Rejects unknown top-level fields unless they are in extensions
 *
 * @param manifest - Manifest to validate (can be partial/unknown structure)
 * @returns Validation result
 */
export function validatePolicyManifestSchema(manifest: unknown): SchemaValidationResult {
  if (typeof manifest !== "object" || manifest === null) {
    return {
      valid: false,
      errors: [
        {
          field: "",
          message: "Policy manifest must be an object",
        },
      ],
    };
  }

  const errors: SchemaValidationError[] = [];
  const obj = manifest as Record<string, unknown>;

  // Check extensions type if present
  if ("extensions" in obj) {
    if (typeof obj.extensions !== "object" || obj.extensions === null) {
      errors.push({
        field: "extensions",
        message: "Extensions must be an object",
      });
    }
  }

  // Check all top-level fields
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      errors.push({
        field: key,
        message: `Unknown top-level field: ${key}`,
        detail: `Field must be in the spec or nested under 'extensions'`,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validate and parse policy manifest
 * Returns typed manifest if valid, errors otherwise
 */
export function validateAndParsePolicyManifest(
  manifest: unknown
):
  | { valid: true; manifest: PolicyManifestV09 }
  | { valid: false; errors: SchemaValidationError[] } {
  const schemaResult = validatePolicyManifestSchema(manifest);
  if (!schemaResult.valid) {
    return schemaResult;
  }

  // Type assertion - in production, you'd want more thorough runtime validation
  // For now, we trust TypeScript types after schema validation
  return {
    valid: true,
    manifest: manifest as PolicyManifestV09,
  };
}
