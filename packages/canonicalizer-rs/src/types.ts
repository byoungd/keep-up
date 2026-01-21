export type CanonMark = "bold" | "italic" | "underline" | "strike" | "code" | "link";

export type CanonNode = CanonBlock | CanonText;

export type CanonBlock = {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  children: CanonNode[];
};

export type CanonText = {
  text: string;
  marks: CanonMark[];
  is_leaf: true;
  attrs?: { href?: string };
};

export type CanonInputNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;
      attrs: Record<string, string>;
      children: CanonInputNode[];
    };

export type CanonicalizeDocumentInput = {
  root: CanonInputNode;
};

export type CanonicalizerPolicyV2 = {
  version: "v2";
  mode: "recursive_tree";
  mark_order: CanonMark[];
  normalize_whitespace: boolean;
  drop_empty_nodes: boolean;
};

export type CanonDiag =
  | { kind: "dropped_empty_node"; path: string }
  | { kind: "unknown_mark"; tag: string; path: string }
  | { kind: "unknown_block"; tag: string; path: string }
  | { kind: "normalized_whitespace"; path: string }
  | { kind: "dropped_invalid_href"; path: string; href: string }
  | { kind: "dropped_non_link_href"; path: string; mark: string };

export type CanonicalizeResult = {
  root: CanonNode;
  diagnostics: CanonDiag[];
};

export type NativeCanonicalizerBinding = {
  canonicalizeDocument: (
    input: CanonicalizeDocumentInput,
    policy?: CanonicalizerPolicyV2
  ) => CanonicalizeResult;
};
