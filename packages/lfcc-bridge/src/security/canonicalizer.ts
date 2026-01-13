/**
 * LFCC v0.9.4 - Canonicalizer
 * @see docs/specs/LFCC_v0.9_RC.md §8 (Canonicalizer Specification)
 *
 * Implements deterministic canonical serialization for:
 * - Document checksums (Appendix A)
 * - Cross-implementation interoperability
 *
 * Key rules:
 * - CANON-ID-001: Node IDs are deterministic pre-order counters
 * - Text normalized to NFC, CRLF/CR → LF
 * - Control characters stripped (C0/C1 except Tab/LF)
 */

import type { Node as PMNode } from "prosemirror-model";

// ============================================================================
// Types
// ============================================================================

/**
 * Canonical node representation (LFCC §8.1)
 */
export interface CanonNode {
  /** Deterministic snapshot-local ID (pre-order counter) */
  id: number;
  /** Node type name */
  type: string;
  /** Canonical attributes (sorted, normalized) */
  attrs: Record<string, unknown>;
  /** Text content (normalized NFC, control chars stripped) */
  text?: string;
  /** Marks applied to text nodes */
  marks?: CanonMark[];
  /** Child nodes */
  children?: CanonNode[];
}

/**
 * Canonical mark representation
 */
export interface CanonMark {
  /** Mark type name */
  type: string;
  /** Mark attributes (sorted) */
  attrs?: Record<string, unknown>;
}

// ============================================================================
// Control Character Stripping (Appendix A.1)
// ============================================================================

/**
 * Strip C0 and C1 control characters except Tab (U+0009) and LF (U+000A).
 * Also normalizes CR and CRLF to LF.
 *
 * @param text - Input text
 * @returns Cleaned text
 */
export function stripControlChars(text: string): string {
  // Normalize line endings first: CRLF → LF, CR → LF
  let result = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip C0 control characters (U+0000–U+001F) except Tab (U+0009) and LF (U+000A)
  // Strip C1 control characters (U+0080–U+009F)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control chars for stripping
  result = result.replace(/[\u0000-\u0008\u000B-\u001F\u0080-\u009F]/g, "");

  return result;
}

/**
 * Normalize text to NFC and strip control characters.
 *
 * @param text - Input text
 * @returns Normalized and cleaned text
 */
export function normalizeText(text: string): string {
  // NFC normalization
  const nfc = text.normalize("NFC");
  // Strip control characters
  return stripControlChars(nfc);
}

// ============================================================================
// Attribute Normalization
// ============================================================================

/**
 * Normalize attributes for canonical representation.
 * - Sort keys alphabetically
 * - Exclude null/undefined values
 * - Exclude internal/transient attributes
 *
 * @param attrs - Raw attributes object
 * @returns Sorted, normalized attributes
 */
export function normalizeAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const EXCLUDED_KEYS = new Set(["__internal", "__transient"]);

  const entries = Object.entries(attrs)
    .filter(([key, value]) => {
      if (EXCLUDED_KEYS.has(key)) {
        return false;
      }
      if (value === null || value === undefined) {
        return false;
      }
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(entries);
}

// ============================================================================
// Canonicalizer
// ============================================================================

/**
 * State for canonicalization (tracks the pre-order counter)
 */
interface CanonState {
  nextId: number;
}

/**
 * Canonicalize a ProseMirror node to CanonNode.
 *
 * Implements CANON-ID-001: IDs are depth-first pre-order counters.
 *
 * @param node - ProseMirror node
 * @param state - Canonicalization state (internal)
 * @returns Canonical node representation
 */
export function toCanonNode(node: PMNode, state: CanonState = { nextId: 0 }): CanonNode {
  // Assign ID using pre-order traversal
  const id = state.nextId++;

  const canonNode: CanonNode = {
    id,
    type: node.type.name,
    attrs: normalizeAttrs(node.attrs),
  };

  // Handle text nodes
  if (node.isText && node.text) {
    canonNode.text = normalizeText(node.text);

    // Serialize marks
    if (node.marks.length > 0) {
      canonNode.marks = node.marks
        .map((mark) => ({
          type: mark.type.name,
          attrs: Object.keys(mark.attrs).length > 0 ? normalizeAttrs(mark.attrs) : undefined,
        }))
        .sort((a, b) => a.type.localeCompare(b.type));
    }
  }

  // Recursively canonicalize children
  if (node.childCount > 0) {
    const children: CanonNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      children.push(toCanonNode(child, state));
    }
    canonNode.children = children;
  }

  return canonNode;
}

/**
 * Canonicalize a ProseMirror document.
 *
 * @param doc - ProseMirror document node
 * @returns Canonical representation
 */
export function canonicalizeDocument(doc: PMNode): CanonNode {
  return toCanonNode(doc, { nextId: 0 });
}

// ============================================================================
// Serialization (for Checksums)
// ============================================================================

/**
 * Serialize CanonNode to deterministic JSON string.
 * Uses sorted keys for consistent output.
 *
 * @param node - Canonical node
 * @returns Deterministic JSON string
 */
export function serializeCanonNode(node: CanonNode): string {
  // Use replacer to ensure consistent key order
  return JSON.stringify(node, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce(
          (sorted, k) => {
            sorted[k] = value[k];
            return sorted;
          },
          {} as Record<string, unknown>
        );
    }
    return value;
  });
}

/**
 * Generate LFCC_DOC_V1 checksum input.
 * This is the canonical serialization that should be hashed for checksums.
 *
 * @param doc - ProseMirror document
 * @returns Canonical JSON string for hashing
 */
export function getChecksumInput(doc: PMNode): string {
  const canonDoc = canonicalizeDocument(doc);
  return serializeCanonNode(canonDoc);
}
