export type LineRange = {
  start: number;
  end: number;
};

export type MarkdownSemanticTarget = {
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

export type MarkdownPreconditionV1 = {
  v: 1;
  mode: "markdown";
  id: string;
  block_id?: string;
  line_range?: LineRange;
  semantic?: MarkdownSemanticTarget;
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

export type MdReplaceBlock = {
  op: "md_replace_block";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownSemanticTarget };
  content: string;
};

export type MdUpdateFrontmatter = {
  op: "md_update_frontmatter";
  precondition_id: string;
  target: { key_path: string[] };
  value: unknown;
  create_if_missing?: boolean;
};

export type MdInsertAfter = {
  op: "md_insert_after";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownSemanticTarget };
  content: string;
};

export type MdInsertBefore = {
  op: "md_insert_before";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownSemanticTarget };
  content: string;
};

export type MdInsertCodeFence = {
  op: "md_insert_code_fence";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownSemanticTarget };
  language?: string;
  content: string;
  fence_char?: "`" | "~";
  fence_length?: number;
};

export type MarkdownOperation =
  | MdReplaceLines
  | MdInsertLines
  | MdDeleteLines
  | MdReplaceBlock
  | MdUpdateFrontmatter
  | MdInsertAfter
  | MdInsertBefore
  | MdInsertCodeFence;

export type MarkdownOperationErrorCode =
  | "MCM_INVALID_REQUEST"
  | "MCM_INVALID_RANGE"
  | "MCM_INVALID_TARGET"
  | "MCM_PRECONDITION_FAILED"
  | "MCM_CONTENT_HASH_MISMATCH"
  | "MCM_OPERATION_OVERLAP"
  | "MCM_OPERATION_UNSUPPORTED"
  | "MCM_FRONTMATTER_INVALID"
  | "MCM_BLOCK_TYPE_DISALLOWED"
  | "MCM_LANGUAGE_DISALLOWED"
  | "MCM_LINE_LIMIT_EXCEEDED"
  | "MCM_TARGETING_AMBIGUOUS"
  | "MCM_TARGETING_NOT_FOUND"
  | "MCM_TARGETING_SCOPE_EXCEEDED";

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
  | { ok: true; content: string; applied: MarkdownAppliedOperation[] }
  | { ok: false; error: MarkdownOperationError };

export type MarkdownHeadingBlock = {
  type: "md_heading";
  block_id: string;
  line_range: LineRange;
  level: number;
  style: "atx" | "setext";
  text: string;
  anchor_id?: string;
};

export type MarkdownCodeFenceBlock = {
  type: "md_code_fence";
  block_id: string;
  line_range: LineRange;
  language?: string;
  info_string?: string;
  content: string;
  fence_char: "`" | "~";
  fence_length: number;
};

export type MarkdownFrontmatterBlock = {
  type: "md_frontmatter";
  block_id: string;
  line_range: LineRange;
  syntax: "yaml" | "toml" | "json";
  raw_content: string;
  parsed?: { keys: FrontmatterKey[] };
};

export type MarkdownCodeSymbol = {
  block_id: string;
  language?: string;
  name: string;
  kind: string;
  line_range: LineRange;
};

export type MarkdownBlock =
  | MarkdownHeadingBlock
  | MarkdownCodeFenceBlock
  | MarkdownFrontmatterBlock
  | {
      type:
        | "md_document"
        | "md_paragraph"
        | "md_code_indent"
        | "md_blockquote"
        | "md_list"
        | "md_list_item"
        | "md_table"
        | "md_table_row"
        | "md_table_cell"
        | "md_thematic_break"
        | "md_link_def"
        | "md_html_block"
        | "md_math_block";
      block_id: string;
      line_range: LineRange;
    };

export type FrontmatterKey = {
  key: string;
  path: string[];
  value_type: "string" | "number" | "boolean" | "array" | "object" | "null";
  line_range: LineRange;
  raw_value: string;
};

export type MarkdownSemanticIndex = {
  line_count: number;
  headings: Array<{
    kind: "heading";
    line_range: LineRange;
    level: number;
    text: string;
  }>;
  code_fences: Array<{
    kind: "code_fence";
    line_range: LineRange;
    language?: string;
    info_string?: string;
  }>;
  symbols?: MarkdownCodeSymbol[];
  frontmatter?: {
    kind: "frontmatter";
    line_range: LineRange;
    syntax: "yaml" | "toml" | "json";
  };
  frontmatter_data?: unknown;
  frontmatter_error?: MarkdownOperationError;
};

export type MarkdownSemanticResolutionResult =
  | { ok: true; range: LineRange }
  | { ok: false; error: MarkdownOperationError };

export type MarkdownTargetingPolicyV1 = {
  require_content_hash: boolean;
  require_context: boolean;
  max_semantic_search_lines: number;
  max_context_prefix_chars: number;
};

export type MarkdownFrontmatterPolicy = {
  allow_frontmatter: boolean;
  frontmatter_formats: Array<"yaml" | "toml" | "json">;
  max_frontmatter_bytes?: number;
};

export type PerformancePolicyV1 = {
  enabled: boolean;
  incremental_index: {
    enabled: boolean;
    max_edit_log_entries: number;
    dirty_region_merge_threshold: number;
  };
  cache: {
    enabled: boolean;
    max_entries: number;
    ttl_seconds?: number;
  };
  parallel: {
    enabled: boolean;
    max_threads: number;
    batch_threshold: number;
  };
  ast_parsing: {
    enabled: boolean;
    languages: string[];
    max_parse_bytes: number;
  };
  streaming: {
    enabled: boolean;
    chunk_size_bytes: number;
    memory_limit_bytes: number;
    overlap_lines: number;
  };
};

export type MarkdownApplyOptions = {
  targetingPolicy?: MarkdownTargetingPolicyV1;
  frontmatterPolicy?: MarkdownFrontmatterPolicy;
  performancePolicy?: PerformancePolicyV1;
};

export type MarkdownContentHashOptions = {
  ignore_frontmatter?: boolean;
};

export type MarkdownParseOptions = {
  include_frontmatter?: boolean;
};

export type MarkdownDiagnostic = {
  code: string;
  line?: number;
  detail: string;
};

export type MarkdownParseResult = {
  content: string;
  content_hash: string;
  structure: {
    frontmatter?: MarkdownFrontmatterBlock;
    blocks: MarkdownBlock[];
  };
  diagnostics: MarkdownDiagnostic[];
};

export type NativeMarkdownContentBinding = {
  normalizeMarkdownText: (text: string) => string;
  splitMarkdownLines: (text: string) => string[];
  computeMarkdownLineHash: (lines: string[], range: LineRange) => string;
  computeMarkdownContentHash: (content: string, options?: MarkdownContentHashOptions) => string;
  buildMarkdownSemanticIndex: (
    lines: string[],
    options?: { performancePolicy?: PerformancePolicyV1 }
  ) => MarkdownSemanticIndex;
  resolveMarkdownSemanticTarget: (
    semantic: MarkdownSemanticTarget,
    index: MarkdownSemanticIndex,
    policy?: MarkdownTargetingPolicyV1
  ) => MarkdownSemanticResolutionResult;
  applyMarkdownLineOperations: (
    content: string,
    envelope: MarkdownOperationEnvelope,
    options?: MarkdownApplyOptions
  ) => MarkdownLineApplyResult;
  parseMarkdownBlocks: (content: string, options?: MarkdownParseOptions) => MarkdownParseResult;
};
