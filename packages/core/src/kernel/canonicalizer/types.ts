/**
 * LFCC v0.9 RC - Canonical Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 2.1
 */

/** Allowed mark types in strict order */
export type CanonMark = "bold" | "italic" | "underline" | "strike" | "code" | "link";

/** Union type for canonical nodes */
export type CanonNode = CanonBlock | CanonText;

/** Structural block node */
export type CanonBlock = {
  /** Snapshot-local deterministic id for diffs/debug ONLY (MUST NOT replace LFCC block_id) */
  id: string;
  /** Structural role, e.g. "paragraph", "list_item", "table_row", "table_cell" */
  type: string;
  /** Canonicalized attrs with stable key ordering and normalization */
  attrs: Record<string, unknown>;
  /** Ordered children, recursive */
  children: CanonNode[];
};

/** Leaf text node */
export type CanonText = {
  text: string;
  marks: CanonMark[];
  is_leaf: true;
  attrs?: { href?: string };
};

/** Type guard for CanonText */
export function isCanonText(node: CanonNode): node is CanonText {
  return "is_leaf" in node && node.is_leaf === true;
}

/** Type guard for CanonBlock */
export function isCanonBlock(node: CanonNode): node is CanonBlock {
  return !isCanonText(node);
}

/** Canonicalizer policy configuration */
export type CanonicalizerPolicyV2 = {
  version: "v2";
  mode: "recursive_tree";
  mark_order: CanonMark[];
  normalize_whitespace: boolean;
  drop_empty_nodes: boolean;
};

/** Platform-independent input node */
export type CanonInputNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;
      attrs: Record<string, string>;
      children: CanonInputNode[];
    };

/** Input for canonicalize function */
export type CanonicalizeDocumentInput = {
  root: CanonInputNode;
  mapTagToBlockType?: (tag: string, attrs: Record<string, string>) => string | null;
};

/** Diagnostic types */
export type CanonDiag =
  | { kind: "dropped_empty_node"; path: string }
  | { kind: "unknown_mark"; tag: string; path: string }
  | { kind: "unknown_block"; tag: string; path: string }
  | { kind: "normalized_whitespace"; path: string }
  | { kind: "dropped_invalid_href"; path: string; href: string }
  | { kind: "dropped_non_link_href"; path: string; mark: string };

/** Result of canonicalization */
export type CanonicalizeResult = {
  root: CanonNode;
  diagnostics: CanonDiag[];
};

/** Default mark order per LFCC spec */
export const DEFAULT_MARK_ORDER: CanonMark[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
];

/** Default canonicalizer policy */
export const DEFAULT_CANONICALIZER_POLICY: CanonicalizerPolicyV2 = {
  version: "v2",
  mode: "recursive_tree",
  mark_order: DEFAULT_MARK_ORDER,
  normalize_whitespace: true,
  drop_empty_nodes: true,
};
