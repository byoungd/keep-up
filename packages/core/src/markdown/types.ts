export type LineRange = {
  start: number;
  end: number;
};

export type MarkdownPreconditionV1 = {
  v: 1;
  mode: "markdown";
  id: string;
  block_id?: string;
  line_range?: LineRange;
  semantic?: {
    kind: "heading" | "code_fence" | "frontmatter" | "frontmatter_key";
    heading_text?: string;
    heading_text_mode?: "exact" | "prefix";
    heading_level?: number;
    language?: string;
    after_heading?: string;
    after_heading_mode?: "exact" | "prefix";
    key_path?: string[];
    nth?: number;
  };
  content_hash?: string;
  context?: {
    line_before_prefix?: string;
    line_after_prefix?: string;
  };
};

export type MarkdownOperationEnvelope = {
  mode: "markdown";
  doc_id: string;
  doc_frontier: string;
  request_id?: string;
  agent_id?: string;
  preconditions: MarkdownPreconditionV1[];
  ops: MarkdownOperation[];
  options?: {
    return_delta?: boolean;
    validate_syntax?: boolean;
    validate_frontmatter?: boolean;
  };
};

export type MdReplaceLines = {
  op: "md_replace_lines";
  precondition_id: string;
  target: { line_range: LineRange };
  content: string;
};

export type MdInsertLines = {
  op: "md_insert_lines";
  precondition_id: string;
  target: { after_line: number } | { before_line: number };
  content: string;
};

export type MdDeleteLines = {
  op: "md_delete_lines";
  precondition_id: string;
  target: { line_range: LineRange };
};

export type MarkdownOperation = MdReplaceLines | MdInsertLines | MdDeleteLines;

export type MarkdownOperationErrorCode =
  | "MCM_INVALID_REQUEST"
  | "MCM_INVALID_RANGE"
  | "MCM_INVALID_TARGET"
  | "MCM_PRECONDITION_FAILED"
  | "MCM_CONTENT_HASH_MISMATCH"
  | "MCM_OPERATION_OVERLAP"
  | "MCM_OPERATION_UNSUPPORTED";

export type MarkdownOperationError = {
  code: MarkdownOperationErrorCode;
  message: string;
  precondition_id?: string;
  op_index?: number;
};

export type MarkdownAppliedOperation = {
  op_index: number;
  op: MarkdownOperation;
  resolved_range: LineRange;
};

export type MarkdownLineApplyResult =
  | {
      ok: true;
      content: string;
      applied: MarkdownAppliedOperation[];
    }
  | {
      ok: false;
      error: MarkdownOperationError;
    };
