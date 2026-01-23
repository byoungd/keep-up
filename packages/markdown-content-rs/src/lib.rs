use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

// =============================================================================
// Types
// =============================================================================

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[napi(object)]
pub struct LineRange {
    pub start: u32,
    pub end: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownSemanticTarget {
    kind: String,
    heading_text: Option<String>,
    heading_text_mode: Option<String>,
    heading_level: Option<u32>,
    language: Option<String>,
    after_heading: Option<String>,
    after_heading_mode: Option<String>,
    key_path: Option<Vec<String>>,
    nth: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownPreconditionV1 {
    v: u32,
    mode: String,
    id: String,
    block_id: Option<String>,
    line_range: Option<LineRange>,
    semantic: Option<MarkdownSemanticTarget>,
    content_hash: Option<String>,
    context: Option<MarkdownContextPrefix>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownContextPrefix {
    line_before_prefix: Option<String>,
    line_after_prefix: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownOperationEnvelope {
    mode: String,
    doc_id: String,
    doc_frontier: String,
    request_id: Option<String>,
    agent_id: Option<String>,
    preconditions: Vec<MarkdownPreconditionV1>,
    ops: Vec<MarkdownOperation>,
    options: Option<MarkdownOperationOptions>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownOperationOptions {
    return_delta: Option<bool>,
    validate_syntax: Option<bool>,
    validate_frontmatter: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum MarkdownOperation {
    #[serde(rename = "md_replace_lines")]
    ReplaceLines(MdReplaceLines),
    #[serde(rename = "md_insert_lines")]
    InsertLines(MdInsertLines),
    #[serde(rename = "md_delete_lines")]
    DeleteLines(MdDeleteLines),
    #[serde(rename = "md_replace_block")]
    ReplaceBlock(MdReplaceBlock),
    #[serde(rename = "md_update_frontmatter")]
    UpdateFrontmatter(MdUpdateFrontmatter),
    #[serde(rename = "md_insert_after")]
    InsertAfter(MdInsertAfter),
    #[serde(rename = "md_insert_before")]
    InsertBefore(MdInsertBefore),
    #[serde(rename = "md_insert_code_fence")]
    InsertCodeFence(MdInsertCodeFence),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdReplaceLines {
    precondition_id: String,
    target: LineRangeTarget,
    content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct LineRangeTarget {
    line_range: LineRange,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdInsertLines {
    precondition_id: String,
    target: MdInsertLinesTarget,
    content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdInsertLinesTarget {
    after_line: Option<u32>,
    before_line: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdDeleteLines {
    precondition_id: String,
    target: LineRangeTarget,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdReplaceBlock {
    precondition_id: String,
    target: BlockTarget,
    content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdInsertAfter {
    precondition_id: String,
    target: BlockTarget,
    content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdInsertBefore {
    precondition_id: String,
    target: BlockTarget,
    content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdInsertCodeFence {
    precondition_id: String,
    target: BlockTarget,
    language: Option<String>,
    content: String,
    fence_char: Option<String>,
    fence_length: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MdUpdateFrontmatter {
    precondition_id: String,
    target: FrontmatterTarget,
    value: Value,
    create_if_missing: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct FrontmatterTarget {
    key_path: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct BlockTarget {
    block_id: Option<String>,
    semantic: Option<MarkdownSemanticTarget>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownOperationError {
    code: String,
    message: String,
    precondition_id: Option<String>,
    op_index: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
struct MarkdownAppliedOperation {
    op_index: u32,
    op: MarkdownOperation,
    resolved_range: LineRange,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
enum MarkdownLineApplyResult {
    Ok {
        ok: bool,
        content: String,
        applied: Vec<MarkdownAppliedOperation>,
    },
    Err {
        ok: bool,
        error: MarkdownOperationError,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownTargetingPolicyV1 {
    require_content_hash: bool,
    require_context: bool,
    max_semantic_search_lines: u32,
    max_context_prefix_chars: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownFrontmatterPolicy {
    allow_frontmatter: bool,
    frontmatter_formats: Vec<String>,
    max_frontmatter_bytes: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct MarkdownApplyOptions {
    #[serde(rename = "targetingPolicy")]
    targeting_policy: Option<MarkdownTargetingPolicyV1>,
    #[serde(rename = "frontmatterPolicy")]
    frontmatter_policy: Option<MarkdownFrontmatterPolicy>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
#[napi(object)]
pub struct MarkdownContentHashOptions {
    pub ignore_frontmatter: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownHeadingBlock {
    kind: String,
    line_range: LineRange,
    level: u32,
    text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownCodeFenceBlock {
    kind: String,
    line_range: LineRange,
    language: Option<String>,
    info_string: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownFrontmatterBlock {
    kind: String,
    line_range: LineRange,
    syntax: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownSemanticIndex {
    line_count: u32,
    headings: Vec<MarkdownHeadingBlock>,
    code_fences: Vec<MarkdownCodeFenceBlock>,
    frontmatter: Option<MarkdownFrontmatterBlock>,
    frontmatter_data: Option<Value>,
    frontmatter_error: Option<MarkdownOperationError>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
enum MarkdownSemanticResolutionResult {
    Ok { ok: bool, range: LineRange },
    Err { ok: bool, error: MarkdownOperationError },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownDiagnostic {
    code: String,
    line: Option<u32>,
    detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownParseResult {
    content: String,
    content_hash: String,
    structure: MarkdownStructure,
    diagnostics: Vec<MarkdownDiagnostic>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct MarkdownStructure {
    frontmatter: Option<FrontmatterBlock>,
    blocks: Vec<MarkdownBlock>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct FrontmatterBlock {
    block_id: String,
    line_range: LineRange,
    syntax: String,
    raw_content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
enum MarkdownBlock {
    Heading(HeadingBlock),
    CodeFence(CodeFenceBlock),
    Frontmatter(FrontmatterBlock),
    Simple(SimpleBlock),
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct HeadingBlock {
    #[serde(rename = "type")]
    block_type: String,
    block_id: String,
    line_range: LineRange,
    level: u32,
    style: String,
    text: String,
    anchor_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct CodeFenceBlock {
    #[serde(rename = "type")]
    block_type: String,
    block_id: String,
    line_range: LineRange,
    language: Option<String>,
    info_string: Option<String>,
    content: String,
    fence_char: String,
    fence_length: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct SimpleBlock {
    #[serde(rename = "type")]
    block_type: String,
    block_id: String,
    line_range: LineRange,
}

#[derive(Clone, Debug)]
struct ResolvedOperation {
    op_index: usize,
    op: MarkdownOperation,
    resolved_range: LineRange,
    insert_index: Option<usize>,
}

// =============================================================================
// Regex Patterns
// =============================================================================

static ATX_HEADING_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}(#{1,6})\s*(.*?)\s*$").unwrap());
static SETEXT_HEADING_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}(=+|-+)\s*$").unwrap());
static CODE_FENCE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}(`{3,}|~{3,})(.*)$").unwrap());
static THEMATIC_BREAK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$").unwrap());
static UNORDERED_LIST_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}([*+-])\s+(.*)$").unwrap());
static ORDERED_LIST_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}(\d+)([.)])\s+(.*)$").unwrap());
static TASK_LIST_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}([*+-])\s+\[([ xX])\]\s+(.*)$").unwrap());
static BLOCKQUOTE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s{0,3}>\s?(.*)$").unwrap());
static TABLE_SEPARATOR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$").unwrap());
static LINK_DEF_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}\[[^\]]+\]:\s+\S+").unwrap());
static HTML_BLOCK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s{0,3}<[^>]+>").unwrap());

// =============================================================================
// Public N-API Functions
// =============================================================================

#[napi(js_name = "normalizeMarkdownText")]
pub fn normalize_markdown_text(text: String) -> String {
    normalize_line_endings(&text)
}

#[napi(js_name = "splitMarkdownLines")]
pub fn split_markdown_lines(text: String) -> Vec<String> {
    normalize_markdown_text(text).split('\n').map(str::to_string).collect()
}

#[napi(js_name = "computeMarkdownLineHash")]
pub fn compute_markdown_line_hash(lines: Vec<String>, range: LineRange) -> NapiResult<String> {
    validate_line_range(&range, lines.len())
        .map_err(|err| napi::Error::from_reason(err.message))?;
    Ok(compute_line_hash(&lines, &range))
}

#[napi(js_name = "computeMarkdownContentHash")]
pub fn compute_markdown_content_hash(
    content: String,
    options: Option<MarkdownContentHashOptions>,
) -> NapiResult<String> {
    let ignore_frontmatter = options.and_then(|opts| opts.ignore_frontmatter).unwrap_or(false);
    Ok(compute_content_hash(&content, ignore_frontmatter))
}

#[napi(js_name = "buildMarkdownSemanticIndex")]
pub fn build_markdown_semantic_index(lines: Vec<String>) -> NapiResult<Value> {
    let index = build_semantic_index(&lines);
    serde_json::to_value(index).map_err(to_napi_error)
}

#[napi(js_name = "resolveMarkdownSemanticTarget")]
pub fn resolve_markdown_semantic_target(
    semantic: Value,
    index: Value,
    policy: Option<Value>,
) -> NapiResult<Value> {
    let semantic: MarkdownSemanticTarget = serde_json::from_value(semantic).map_err(to_napi_error)?;
    let index: MarkdownSemanticIndex = serde_json::from_value(index).map_err(to_napi_error)?;
    let policy: Option<MarkdownTargetingPolicyV1> = match policy {
        Some(value) => Some(serde_json::from_value(value).map_err(to_napi_error)?),
        None => None,
    };

    let result = resolve_semantic_target(&semantic, &index, policy.as_ref());
    serde_json::to_value(result).map_err(to_napi_error)
}

#[napi(js_name = "applyMarkdownLineOperations")]
pub fn apply_markdown_line_operations(
    content: String,
    envelope: Value,
    options: Option<Value>,
) -> NapiResult<Value> {
    let envelope: MarkdownOperationEnvelope =
        serde_json::from_value(envelope).map_err(to_napi_error)?;
    let options: Option<MarkdownApplyOptions> = match options {
        Some(value) => Some(serde_json::from_value(value).map_err(to_napi_error)?),
        None => None,
    };

    let result = apply_markdown_ops_internal(&content, &envelope, options.as_ref());
    serde_json::to_value(result).map_err(to_napi_error)
}

#[napi(js_name = "parseMarkdownBlocks")]
pub fn parse_markdown_blocks(content: String, _options: Option<Value>) -> NapiResult<Value> {
    let normalized = normalize_markdown_text(content.clone());
    let lines: Vec<String> = normalized.split('\n').map(str::to_string).collect();
    let line_count = lines.len();

    let frontmatter_detection = detect_frontmatter(&lines);
    let frontmatter_block = frontmatter_detection
        .as_ref()
        .map(|detection| build_frontmatter_block(detection, &lines));

    let mut blocks = Vec::new();
    let doc_range = LineRange {
        start: 1,
        end: line_count.max(1) as u32,
    };
    let doc_block_id = compute_block_id("md_document", &doc_range, &lines);
    blocks.push(MarkdownBlock::Simple(SimpleBlock {
        block_type: "md_document".to_string(),
        block_id: doc_block_id,
        line_range: doc_range.clone(),
    }));

    if let Some(frontmatter) = frontmatter_block.clone() {
        blocks.push(MarkdownBlock::Frontmatter(frontmatter));
    }

    let mut parsed_blocks = build_blocks(&lines, frontmatter_detection.as_ref());
    blocks.append(&mut parsed_blocks);

    let content_hash = compute_content_hash(&normalized, false);
    let result = MarkdownParseResult {
        content: normalized,
        content_hash,
        structure: MarkdownStructure {
            frontmatter: frontmatter_block,
            blocks,
        },
        diagnostics: Vec::new(),
    };

    serde_json::to_value(result).map_err(to_napi_error)
}

// =============================================================================
// Internal Implementation
// =============================================================================

fn to_napi_error(err: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(err.to_string())
}

fn normalize_line_endings(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            out.push('\n');
        } else {
            out.push(ch);
        }
    }
    out
}

fn strip_control_chars(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    for ch in text.chars() {
        let code = ch as u32;
        if ch == '\t' || ch == '\n' {
            result.push(ch);
            continue;
        }
        if code <= 0x1f || (code >= 0x7f && code <= 0x9f) {
            continue;
        }
        result.push(ch);
    }
    result
}

fn sha256_hex(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn compute_line_hash(lines: &[String], range: &LineRange) -> String {
    let start = range.start.saturating_sub(1) as usize;
    let end = range.end.saturating_sub(1) as usize;
    let slice = lines
        .get(start..=end)
        .unwrap_or(&[])
        .join("\n");
    let normalized = strip_control_chars(&slice);
    let canonical = format!(
        "LFCC_MD_LINE_V1\nstart={}\nend={}\ntext={}",
        range.start, range.end, normalized
    );
    sha256_hex(&canonical)
}

fn compute_content_hash(content: &str, ignore_frontmatter: bool) -> String {
    let normalized = normalize_line_endings(content);
    let lines: Vec<String> = normalized.split('\n').map(str::to_string).collect();
    let filtered = if ignore_frontmatter {
        strip_frontmatter_lines(&lines)
    } else {
        lines
    };
    let joined = filtered.join("\n");
    let sanitized = strip_control_chars(&joined);
    let canonical = format!(
        "LFCC_MD_CONTENT_V1\nignore_frontmatter={}\ntext={}",
        if ignore_frontmatter { "true" } else { "false" },
        sanitized
    );
    sha256_hex(&canonical)
}

fn strip_frontmatter_lines(lines: &[String]) -> Vec<String> {
    if let Some(frontmatter) = detect_frontmatter(lines) {
        let mut result = Vec::new();
        result.extend_from_slice(&lines[..frontmatter.start_index]);
        if frontmatter.end_index + 1 < lines.len() {
            result.extend_from_slice(&lines[frontmatter.end_index + 1..]);
        }
        if !result.is_empty() && result[0].is_empty() {
            result.remove(0);
        }
        return result;
    }
    lines.to_vec()
}

fn validate_line_range(range: &LineRange, line_count: usize) -> Result<(), MarkdownOperationError> {
    if range.start == 0 || range.end == 0 {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_RANGE".to_string(),
            message: "Line range must be 1-indexed".to_string(),
            precondition_id: None,
            op_index: None,
        });
    }
    if range.end < range.start {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_RANGE".to_string(),
            message: "Line range end must be >= start".to_string(),
            precondition_id: None,
            op_index: None,
        });
    }
    if range.end as usize > line_count {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_RANGE".to_string(),
            message: "Line range is out of bounds".to_string(),
            precondition_id: None,
            op_index: None,
        });
    }
    Ok(())
}

// =============================================================================
// Frontmatter
// =============================================================================

#[derive(Clone, Debug)]
struct FrontmatterDetection {
    start_index: usize,
    end_index: usize,
    syntax: String,
    content_lines: Vec<String>,
}

fn detect_frontmatter(lines: &[String]) -> Option<FrontmatterDetection> {
    let mut first_content = None;
    for (idx, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        first_content = Some(idx);
        break;
    }
    let first_content = first_content?;
    let delimiter = lines.get(first_content)?.as_str();
    let syntax = match delimiter {
        "---" => "yaml",
        "+++" => "toml",
        ";;;" => "json",
        _ => return None,
    };
    for idx in (first_content + 1)..lines.len() {
        if lines[idx] == delimiter {
            let content_lines = lines[first_content + 1..idx].to_vec();
            return Some(FrontmatterDetection {
                start_index: first_content,
                end_index: idx,
                syntax: syntax.to_string(),
                content_lines,
            });
        }
    }
    None
}

fn parse_frontmatter(lines: &[String]) -> Result<Option<FrontmatterContext>, MarkdownOperationError> {
    let detection = match detect_frontmatter(lines) {
        Some(value) => value,
        None => return Ok(None),
    };
    let content = detection.content_lines.join("\n");
    let data = parse_frontmatter_content(&content, &detection.syntax)?;
    Ok(Some(FrontmatterContext {
        syntax: detection.syntax,
        data,
        existing_range: LineRange {
            start: (detection.start_index + 1) as u32,
            end: (detection.end_index + 1) as u32,
        },
    }))
}

fn parse_frontmatter_content(
    content: &str,
    syntax: &str,
) -> Result<Value, MarkdownOperationError> {
    if content.trim().is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }
    let value: Result<Value, String> = match syntax {
        "json" => serde_json::from_str::<Value>(content).map_err(|err| err.to_string()),
        "toml" => toml::from_str::<toml::Value>(content)
            .map_err(|err| err.to_string())
            .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
        _ => serde_yaml::from_str::<serde_yaml::Value>(content)
            .map_err(|err| err.to_string())
            .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
    };

    value.map_err(|err| MarkdownOperationError {
        code: "MCM_FRONTMATTER_INVALID".to_string(),
        message: format!("Frontmatter parse failed: {err}"),
        precondition_id: None,
        op_index: None,
    })
}

fn stringify_frontmatter(
    data: &Value,
    syntax: &str,
) -> Result<String, MarkdownOperationError> {
    let normalized = sort_json_value(data);
    match syntax {
        "json" => serde_json::to_string_pretty(&normalized).map_err(|err| MarkdownOperationError {
            code: "MCM_FRONTMATTER_INVALID".to_string(),
            message: format!("Frontmatter stringify failed: {err}"),
            precondition_id: None,
            op_index: None,
        }),
        "toml" => {
            let toml_value = json_to_toml(&normalized)?;
            toml::to_string(&toml_value)
                .map(|value| value.trim_end().to_string())
                .map_err(|err| MarkdownOperationError {
                    code: "MCM_FRONTMATTER_INVALID".to_string(),
                    message: format!("Frontmatter stringify failed: {err}"),
                    precondition_id: None,
                    op_index: None,
                })
        }
        _ => serde_yaml::to_string(&normalized)
            .map(|value| {
                let trimmed = value.trim_end();
                trimmed
                    .strip_prefix("---\n")
                    .unwrap_or(trimmed)
                    .to_string()
            })
            .map_err(|err| MarkdownOperationError {
                code: "MCM_FRONTMATTER_INVALID".to_string(),
                message: format!("Frontmatter stringify failed: {err}"),
                precondition_id: None,
                op_index: None,
            }),
    }
}

fn build_known_frontmatter_lines(syntax: &str, content: &str) -> Vec<String> {
    let delimiter = match syntax {
        "toml" => "+++",
        "json" => ";;;",
        _ => "---",
    };
    let mut lines = Vec::new();
    lines.push(delimiter.to_string());
    if !content.is_empty() {
        lines.extend(content.split('\n').map(str::to_string));
    }
    lines.push(delimiter.to_string());
    lines
}

fn update_frontmatter_value(
    data: &Value,
    key_path: &[String],
    value: Value,
    create_if_missing: bool,
) -> Result<Value, MarkdownOperationError> {
    if key_path.is_empty() {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_TARGET".to_string(),
            message: "key_path must be non-empty".to_string(),
            precondition_id: None,
            op_index: None,
        });
    }
    let mut current = data.clone();
    set_json_value_at_path(&mut current, key_path, value, create_if_missing, true)?;
    Ok(current)
}

fn set_json_value_at_path(
    current: &mut Value,
    path: &[String],
    value: Value,
    create_if_missing: bool,
    is_root: bool,
) -> Result<(), MarkdownOperationError> {
    if path.is_empty() {
        *current = value;
        return Ok(());
    }
    let segment = &path[0];
    let rest = &path[1..];
    if segment.is_empty() {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_TARGET".to_string(),
            message: "Frontmatter path is invalid".to_string(),
            precondition_id: None,
            op_index: None,
        });
    }

    if let Ok(index) = segment.parse::<usize>() {
        let array = coerce_array(current, create_if_missing)?;
        ensure_array_index(array, index, create_if_missing)?;
        if rest.is_empty() {
            array[index] = value;
            return Ok(());
        }
        let next = &mut array[index];
        ensure_child_container(next, rest.get(0), create_if_missing)?;
        return set_json_value_at_path(next, rest, value, create_if_missing, false);
    }

    let obj = coerce_object(current, create_if_missing, is_root)?;
    if rest.is_empty() {
        obj.insert(segment.clone(), value);
        return Ok(());
    }
    if !obj.contains_key(segment) {
        if !create_if_missing {
            return Err(missing_path_error());
        }
        obj.insert(segment.clone(), create_container_for_next(rest.get(0)));
    }
    let next = obj.get_mut(segment).expect("just inserted");
    ensure_child_container(next, rest.get(0), create_if_missing)?;
    set_json_value_at_path(next, rest, value, create_if_missing, false)
}

fn coerce_array<'a>(
    current: &'a mut Value,
    create_if_missing: bool,
) -> Result<&'a mut Vec<Value>, MarkdownOperationError> {
    match current {
        Value::Array(items) => Ok(items),
        Value::Null => {
            if !create_if_missing {
                return Err(missing_path_error());
            }
            *current = Value::Array(Vec::new());
            match current {
                Value::Array(items) => Ok(items),
                _ => unreachable!(),
            }
        }
        _ => Err(MarkdownOperationError {
            code: "MCM_INVALID_TARGET".to_string(),
            message: "Frontmatter path expects array".to_string(),
            precondition_id: None,
            op_index: None,
        }),
    }
}

fn coerce_object<'a>(
    current: &'a mut Value,
    create_if_missing: bool,
    is_root: bool,
) -> Result<&'a mut serde_json::Map<String, Value>, MarkdownOperationError> {
    match current {
        Value::Object(map) => Ok(map),
        Value::Null => {
            if !create_if_missing {
                return Err(missing_path_error());
            }
            if !is_root {
                return Err(MarkdownOperationError {
                    code: "MCM_INVALID_TARGET".to_string(),
                    message: "Frontmatter path expects object".to_string(),
                    precondition_id: None,
                    op_index: None,
                });
            }
            *current = Value::Object(serde_json::Map::new());
            match current {
                Value::Object(map) => Ok(map),
                _ => unreachable!(),
            }
        }
        _ => Err(MarkdownOperationError {
            code: "MCM_INVALID_TARGET".to_string(),
            message: "Frontmatter path expects object".to_string(),
            precondition_id: None,
            op_index: None,
        }),
    }
}

fn ensure_array_index(
    array: &mut Vec<Value>,
    index: usize,
    create_if_missing: bool,
) -> Result<(), MarkdownOperationError> {
    if array.get(index).is_some() {
        return Ok(());
    }
    if !create_if_missing {
        return Err(missing_path_error());
    }
    while array.len() <= index {
        array.push(Value::Null);
    }
    Ok(())
}

fn ensure_child_container(
    value: &mut Value,
    next_segment: Option<&String>,
    create_if_missing: bool,
) -> Result<(), MarkdownOperationError> {
    if value.is_object() || value.is_array() {
        return Ok(());
    }
    if !create_if_missing {
        return Err(missing_path_error());
    }
    *value = create_container_for_next(next_segment);
    Ok(())
}

fn create_container_for_next(next_segment: Option<&String>) -> Value {
    if let Some(segment) = next_segment {
        if segment.parse::<usize>().is_ok() {
            return Value::Array(Vec::new());
        }
    }
    Value::Object(serde_json::Map::new())
}

fn missing_path_error() -> MarkdownOperationError {
    MarkdownOperationError {
        code: "MCM_TARGETING_NOT_FOUND".to_string(),
        message: "Frontmatter path not found".to_string(),
        precondition_id: None,
        op_index: None,
    }
}

fn sort_json_value(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(sort_json_value).collect()),
        Value::Object(map) => {
            let mut sorted = BTreeMap::new();
            for (key, value) in map.iter() {
                sorted.insert(key.clone(), sort_json_value(value));
            }
            serde_json::to_value(sorted).unwrap_or(Value::Object(serde_json::Map::new()))
        }
        _ => value.clone(),
    }
}

fn json_to_toml(value: &Value) -> Result<toml::Value, MarkdownOperationError> {
    match value {
        Value::Null => Err(MarkdownOperationError {
            code: "MCM_FRONTMATTER_INVALID".to_string(),
            message: "Null values are not supported in TOML frontmatter".to_string(),
            precondition_id: None,
            op_index: None,
        }),
        Value::Bool(v) => Ok(toml::Value::Boolean(*v)),
        Value::Number(v) => {
            if let Some(int) = v.as_i64() {
                return Ok(toml::Value::Integer(int));
            }
            if let Some(float) = v.as_f64() {
                return Ok(toml::Value::Float(float));
            }
            Err(MarkdownOperationError {
                code: "MCM_FRONTMATTER_INVALID".to_string(),
                message: "Unsupported number in frontmatter".to_string(),
                precondition_id: None,
                op_index: None,
            })
        }
        Value::String(v) => Ok(toml::Value::String(v.clone())),
        Value::Array(items) => {
            let mut arr = Vec::with_capacity(items.len());
            for item in items {
                arr.push(json_to_toml(item)?);
            }
            Ok(toml::Value::Array(arr))
        }
        Value::Object(map) => {
            let mut table = toml::value::Table::new();
            for (key, value) in map.iter() {
                table.insert(key.clone(), json_to_toml(value)?);
            }
            Ok(toml::Value::Table(table))
        }
    }
}

// =============================================================================
// Semantic Targeting
// =============================================================================

fn build_semantic_index(lines: &[String]) -> MarkdownSemanticIndex {
    let mut headings = Vec::new();
    let mut code_fences = Vec::new();

    let frontmatter_detection = detect_frontmatter(lines);
    let frontmatter_block = frontmatter_detection
        .as_ref()
        .map(|detection| MarkdownFrontmatterBlock {
            kind: "frontmatter".to_string(),
            line_range: LineRange {
                start: (detection.start_index + 1) as u32,
                end: (detection.end_index + 1) as u32,
            },
            syntax: detection.syntax.clone(),
        });

    let frontmatter_parse = parse_frontmatter(lines);
    let (frontmatter_data, frontmatter_error) = match frontmatter_parse {
        Ok(Some(context)) => (Some(context.data), None),
        Ok(None) => (None, None),
        Err(err) => (None, Some(err)),
    };

    let mut i = 0usize;
    while i < lines.len() {
        let line_number = i + 1;
        if let Some(frontmatter) = frontmatter_detection.as_ref() {
            if line_number >= frontmatter.start_index + 1 && line_number <= frontmatter.end_index + 1
            {
                i = frontmatter.end_index + 1;
                continue;
            }
        }

        if let Some(fence) = parse_code_fence(lines, i) {
            let CodeFenceInfo {
                line_range,
                language,
                info_string,
                ..
            } = fence.block;
            code_fences.push(MarkdownCodeFenceBlock {
                kind: "code_fence".to_string(),
                line_range,
                language,
                info_string,
            });
            i = fence.next_index;
            continue;
        }
        if let Some(heading) = parse_heading(lines, i) {
            let HeadingBlockInfo {
                line_range,
                level,
                text,
                ..
            } = heading.block;
            headings.push(MarkdownHeadingBlock {
                kind: "heading".to_string(),
                line_range,
                level,
                text,
            });
            i = heading.next_index;
            continue;
        }
        i += 1;
    }

    MarkdownSemanticIndex {
        line_count: lines.len() as u32,
        headings,
        code_fences,
        frontmatter: frontmatter_block,
        frontmatter_data,
        frontmatter_error,
    }
}

fn resolve_semantic_target(
    semantic: &MarkdownSemanticTarget,
    index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> MarkdownSemanticResolutionResult {
    match semantic.kind.as_str() {
        "heading" => resolve_heading_target(semantic, index, policy),
        "code_fence" => resolve_code_fence_target(semantic, index, policy),
        "frontmatter" => resolve_frontmatter_target(index),
        "frontmatter_key" => resolve_frontmatter_key_target(semantic, index, policy),
        _ => MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_INVALID_TARGET".to_string(),
                message: "Unsupported semantic kind".to_string(),
                precondition_id: None,
                op_index: None,
            },
        },
    }
}

fn resolve_heading_target(
    semantic: &MarkdownSemanticTarget,
    index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> MarkdownSemanticResolutionResult {
    let query = normalize_heading_text(semantic.heading_text.as_deref().unwrap_or(""));
    if query.is_empty() {
        return MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_INVALID_TARGET".to_string(),
                message: "heading_text is required".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }
    let scope = SearchWindow {
        start_line: 1,
        end_line: index.line_count,
    };
    if let Some(error) = ensure_search_within_limit(&scope, policy) {
        return error;
    }
    let mode = semantic.heading_text_mode.as_deref().unwrap_or("exact");
    let matches: Vec<&MarkdownHeadingBlock> = index
        .headings
        .iter()
        .filter(|heading| {
            if let Some(level) = semantic.heading_level {
                if heading.level != level {
                    return false;
                }
            }
            matches_heading_text(&heading.text, &query, mode)
        })
        .collect();

    finalize_semantic_matches(&matches, semantic.nth)
}

fn resolve_code_fence_target(
    semantic: &MarkdownSemanticTarget,
    index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> MarkdownSemanticResolutionResult {
    let mut scope = SearchWindow {
        start_line: 1,
        end_line: index.line_count,
    };
    if let Some(after_heading) = semantic.after_heading.as_ref() {
        let query = normalize_heading_text(after_heading);
        let mode = semantic.after_heading_mode.as_deref().unwrap_or("exact");
        let heading = index
            .headings
            .iter()
            .find(|heading| matches_heading_text(&heading.text, &query, mode));
        let heading = match heading {
            Some(value) => value,
            None => {
                return MarkdownSemanticResolutionResult::Err {
                    ok: false,
                    error: MarkdownOperationError {
                        code: "MCM_TARGETING_NOT_FOUND".to_string(),
                        message: "after_heading not found".to_string(),
                        precondition_id: None,
                        op_index: None,
                    },
                };
            }
        };
        let section_end = find_section_end(&index.headings, heading, index.line_count);
        scope = SearchWindow {
            start_line: heading.line_range.end + 1,
            end_line: section_end,
        };
    }
    if let Some(error) = ensure_search_within_limit(&scope, policy) {
        return error;
    }

    let matches: Vec<&MarkdownCodeFenceBlock> = index
        .code_fences
        .iter()
        .filter(|fence| {
            if fence.line_range.start < scope.start_line || fence.line_range.start > scope.end_line {
                return false;
            }
            if let Some(language) = semantic.language.as_ref() {
                return fence.language.as_deref() == Some(language.as_str());
            }
            true
        })
        .collect();

    finalize_semantic_matches(&matches, semantic.nth)
}

fn resolve_frontmatter_target(index: &MarkdownSemanticIndex) -> MarkdownSemanticResolutionResult {
    let frontmatter = match index.frontmatter.as_ref() {
        Some(value) => value,
        None => {
            return MarkdownSemanticResolutionResult::Err {
                ok: false,
                error: MarkdownOperationError {
                    code: "MCM_TARGETING_NOT_FOUND".to_string(),
                    message: "Frontmatter not found".to_string(),
                    precondition_id: None,
                    op_index: None,
                },
            };
        }
    };
    MarkdownSemanticResolutionResult::Ok {
        ok: true,
        range: frontmatter.line_range.clone(),
    }
}

fn resolve_frontmatter_key_target(
    semantic: &MarkdownSemanticTarget,
    index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> MarkdownSemanticResolutionResult {
    let frontmatter = match index.frontmatter.as_ref() {
        Some(value) => value,
        None => {
            return MarkdownSemanticResolutionResult::Err {
                ok: false,
                error: MarkdownOperationError {
                    code: "MCM_TARGETING_NOT_FOUND".to_string(),
                    message: "Frontmatter not found".to_string(),
                    precondition_id: None,
                    op_index: None,
                },
            };
        }
    };
    let scope = SearchWindow {
        start_line: frontmatter.line_range.start,
        end_line: frontmatter.line_range.end,
    };
    if let Some(error) = ensure_search_within_limit(&scope, policy) {
        return error;
    }
    let key_path = semantic.key_path.as_ref().filter(|path| !path.is_empty());
    let key_path = match key_path {
        Some(path) => path,
        None => {
            return MarkdownSemanticResolutionResult::Err {
                ok: false,
                error: MarkdownOperationError {
                    code: "MCM_INVALID_TARGET".to_string(),
                    message: "key_path is required".to_string(),
                    precondition_id: None,
                    op_index: None,
                },
            };
        }
    };

    if let Some(error) = index.frontmatter_error.as_ref() {
        return MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: error.clone(),
        };
    }

    let frontmatter_data = match index.frontmatter_data.as_ref() {
        Some(value) => value,
        None => {
            return MarkdownSemanticResolutionResult::Err {
                ok: false,
                error: MarkdownOperationError {
                    code: "MCM_TARGETING_NOT_FOUND".to_string(),
                    message: "Frontmatter not found".to_string(),
                    precondition_id: None,
                    op_index: None,
                },
            };
        }
    };

    if !frontmatter_path_exists(frontmatter_data, key_path) {
        return MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_TARGETING_NOT_FOUND".to_string(),
                message: "Frontmatter key not found".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }

    MarkdownSemanticResolutionResult::Ok {
        ok: true,
        range: frontmatter.line_range.clone(),
    }
}

fn frontmatter_path_exists(data: &Value, path: &[String]) -> bool {
    let mut current = data;
    for segment in path {
        if let Ok(index) = segment.parse::<usize>() {
            if let Value::Array(items) = current {
                current = match items.get(index) {
                    Some(value) => value,
                    None => return false,
                };
                continue;
            }
            return false;
        }
        if let Value::Object(map) = current {
            current = match map.get(segment) {
                Some(value) => value,
                None => return false,
            };
            continue;
        }
        return false;
    }
    true
}

struct SearchWindow {
    start_line: u32,
    end_line: u32,
}

fn ensure_search_within_limit(
    scope: &SearchWindow,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> Option<MarkdownSemanticResolutionResult> {
    let max_lines = policy.map(|p| p.max_semantic_search_lines);
    let max_lines = match max_lines {
        Some(value) if value > 0 => value,
        _ => return None,
    };
    let span = scope.end_line.saturating_sub(scope.start_line) + 1;
    if span <= max_lines {
        return None;
    }
    Some(MarkdownSemanticResolutionResult::Err {
        ok: false,
        error: MarkdownOperationError {
            code: "MCM_TARGETING_SCOPE_EXCEEDED".to_string(),
            message: "Semantic search exceeded policy limit".to_string(),
            precondition_id: None,
            op_index: None,
        },
    })
}

fn finalize_semantic_matches<T: HasLineRange>(
    matches: &[T],
    nth: Option<u32>,
) -> MarkdownSemanticResolutionResult {
    if matches.is_empty() {
        return MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_TARGETING_NOT_FOUND".to_string(),
                message: "Semantic target not found".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }
    if let Some(nth) = nth {
        let index = (nth as usize).saturating_sub(1);
        if index >= matches.len() {
            return MarkdownSemanticResolutionResult::Err {
                ok: false,
                error: MarkdownOperationError {
                    code: "MCM_TARGETING_NOT_FOUND".to_string(),
                    message: "Semantic target not found".to_string(),
                    precondition_id: None,
                    op_index: None,
                },
            };
        }
        return MarkdownSemanticResolutionResult::Ok {
            ok: true,
            range: matches[index].line_range().clone(),
        };
    }
    if matches.len() > 1 {
        return MarkdownSemanticResolutionResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_TARGETING_AMBIGUOUS".to_string(),
                message: "Semantic target is ambiguous".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }
    MarkdownSemanticResolutionResult::Ok {
        ok: true,
        range: matches[0].line_range().clone(),
    }
}

trait HasLineRange {
    fn line_range(&self) -> &LineRange;
}

impl HasLineRange for MarkdownHeadingBlock {
    fn line_range(&self) -> &LineRange {
        &self.line_range
    }
}

impl<'a> HasLineRange for &'a MarkdownHeadingBlock {
    fn line_range(&self) -> &LineRange {
        &self.line_range
    }
}

impl HasLineRange for MarkdownCodeFenceBlock {
    fn line_range(&self) -> &LineRange {
        &self.line_range
    }
}

impl<'a> HasLineRange for &'a MarkdownCodeFenceBlock {
    fn line_range(&self) -> &LineRange {
        &self.line_range
    }
}

fn normalize_heading_text(text: &str) -> String {
    text.trim()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

fn strip_trailing_atx_hashes(text: &str) -> String {
    let mut trimmed = text.trim_end().to_string();
    while trimmed.ends_with('#') {
        trimmed.pop();
        trimmed = trimmed.trim_end().to_string();
    }
    trimmed
}

fn matches_heading_text(text: &str, query: &str, mode: &str) -> bool {
    if mode == "prefix" {
        return text.starts_with(query);
    }
    text == query
}

fn find_section_end(headings: &[MarkdownHeadingBlock], current: &MarkdownHeadingBlock, line_count: u32) -> u32 {
    let current_index = headings
        .iter()
        .position(|heading| heading.line_range == current.line_range);
    let current_index = match current_index {
        Some(value) => value,
        None => return line_count,
    };
    for heading in headings.iter().skip(current_index + 1) {
        if heading.level <= current.level {
            return heading.line_range.start.saturating_sub(1);
        }
    }
    line_count
}

// =============================================================================
// Block Parsing
// =============================================================================

fn build_frontmatter_block(detection: &FrontmatterDetection, lines: &[String]) -> FrontmatterBlock {
    let range = LineRange {
        start: (detection.start_index + 1) as u32,
        end: (detection.end_index + 1) as u32,
    };
    let block_id = compute_block_id("md_frontmatter", &range, lines);
    FrontmatterBlock {
        block_id,
        line_range: range,
        syntax: detection.syntax.clone(),
        raw_content: detection.content_lines.join("\n"),
    }
}

fn build_blocks(
    lines: &[String],
    frontmatter: Option<&FrontmatterDetection>,
) -> Vec<MarkdownBlock> {
    let mut blocks = Vec::new();
    let mut i = 0usize;
    let frontmatter_range = frontmatter.map(|fm| (fm.start_index, fm.end_index));

    while i < lines.len() {
        if let Some((start, end)) = frontmatter_range {
            if i >= start && i <= end {
                i = end + 1;
                continue;
            }
        }

        let line = &lines[i];
        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        if let Some(fence) = parse_code_fence(lines, i) {
            let range = fence.block.line_range.clone();
            let block_id = compute_block_id("md_code_fence", &range, lines);
            let start_index = range.start.saturating_sub(1) as usize;
            let end_index = range.end.saturating_sub(1) as usize;
            let closing_line = lines.get(end_index).map(|line| line.trim());
            let closing_is_fence = closing_line
                .map(|line| {
                    line.starts_with(&fence.block.fence_char.to_string().repeat(3))
                        && line
                            .chars()
                            .take_while(|c| *c == fence.block.fence_char)
                            .count() as u32
                            >= fence.block.fence_length
                })
                .unwrap_or(false);
            let content_end = if closing_is_fence && end_index > 0 {
                end_index.saturating_sub(1)
            } else {
                end_index
            };
            let content_lines = if content_end >= start_index + 1 {
                lines
                    .get(start_index + 1..=content_end)
                    .unwrap_or(&[])
                    .to_vec()
            } else {
                Vec::new()
            };

            let block = CodeFenceBlock {
                block_type: "md_code_fence".to_string(),
                block_id,
                line_range: range,
                language: fence.block.language.clone(),
                info_string: fence.block.info_string.clone(),
                content: content_lines.join("\n"),
                fence_char: fence.block.fence_char.to_string(),
                fence_length: fence.block.fence_length,
            };
            blocks.push(MarkdownBlock::CodeFence(block));
            i = fence.next_index;
            continue;
        }

        if let Some(heading) = parse_heading(lines, i) {
            let range = heading.block.line_range.clone();
            let block_id = compute_block_id("md_heading", &range, lines);
            let block = HeadingBlock {
                block_type: "md_heading".to_string(),
                block_id,
                line_range: range,
                level: heading.block.level,
                style: heading.block.style.clone(),
                text: heading.block.text.clone(),
                anchor_id: None,
            };
            blocks.push(MarkdownBlock::Heading(block));
            i = heading.next_index;
            continue;
        }

        if THEMATIC_BREAK_RE.is_match(line) {
            let range = LineRange {
                start: (i + 1) as u32,
                end: (i + 1) as u32,
            };
            let block_id = compute_block_id("md_thematic_break", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_thematic_break".to_string(),
                block_id,
                line_range: range,
            }));
            i += 1;
            continue;
        }

        if BLOCKQUOTE_RE.is_match(line) {
            let start = i;
            let mut end = i;
            for idx in i..lines.len() {
                if !BLOCKQUOTE_RE.is_match(&lines[idx]) {
                    break;
                }
                end = idx;
            }
            let range = LineRange {
                start: (start + 1) as u32,
                end: (end + 1) as u32,
            };
            let block_id = compute_block_id("md_blockquote", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_blockquote".to_string(),
                block_id,
                line_range: range,
            }));
            i = end + 1;
            continue;
        }

        if let Some(list_block) = parse_list_block(lines, i) {
            let range = list_block.range.clone();
            let list_id = compute_block_id("md_list", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_list".to_string(),
                block_id: list_id,
                line_range: range.clone(),
            }));
            for item_range in list_block.item_ranges {
                let block_id = compute_block_id("md_list_item", &item_range, lines);
                blocks.push(MarkdownBlock::Simple(SimpleBlock {
                    block_type: "md_list_item".to_string(),
                    block_id,
                    line_range: item_range,
                }));
            }
            i = list_block.next_index;
            continue;
        }

        if let Some(code_indent) = parse_indented_code(lines, i) {
            let range = code_indent.clone();
            let block_id = compute_block_id("md_code_indent", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_code_indent".to_string(),
                block_id,
                line_range: range,
            }));
            i = code_indent.end as usize;
            continue;
        }

        if let Some(table_block) = parse_table_block(lines, i) {
            let range = table_block.clone();
            let block_id = compute_block_id("md_table", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_table".to_string(),
                block_id,
                line_range: range,
            }));
            i = table_block.end as usize;
            continue;
        }

        if LINK_DEF_RE.is_match(line) {
            let range = LineRange {
                start: (i + 1) as u32,
                end: (i + 1) as u32,
            };
            let block_id = compute_block_id("md_link_def", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_link_def".to_string(),
                block_id,
                line_range: range,
            }));
            i += 1;
            continue;
        }

        if HTML_BLOCK_RE.is_match(line) {
            let start = i;
            let mut end = i;
            for idx in i + 1..lines.len() {
                if lines[idx].trim().is_empty() {
                    break;
                }
                end = idx;
            }
            let range = LineRange {
                start: (start + 1) as u32,
                end: (end + 1) as u32,
            };
            let block_id = compute_block_id("md_html_block", &range, lines);
            blocks.push(MarkdownBlock::Simple(SimpleBlock {
                block_type: "md_html_block".to_string(),
                block_id,
                line_range: range,
            }));
            i = end + 1;
            continue;
        }

        // Paragraph fallback
        let start = i;
        let mut end = i;
        for idx in i + 1..lines.len() {
            if lines[idx].trim().is_empty() {
                break;
            }
            if is_block_start(&lines[idx]) {
                break;
            }
            end = idx;
        }
        let range = LineRange {
            start: (start + 1) as u32,
            end: (end + 1) as u32,
        };
        let block_id = compute_block_id("md_paragraph", &range, lines);
        blocks.push(MarkdownBlock::Simple(SimpleBlock {
            block_type: "md_paragraph".to_string(),
            block_id,
            line_range: range,
        }));
        i = end + 1;
    }

    blocks
}

fn is_block_start(line: &str) -> bool {
    if line.trim().is_empty() {
        return true;
    }
    if ATX_HEADING_RE.is_match(line)
        || CODE_FENCE_RE.is_match(line)
        || THEMATIC_BREAK_RE.is_match(line)
        || BLOCKQUOTE_RE.is_match(line)
        || UNORDERED_LIST_RE.is_match(line)
        || ORDERED_LIST_RE.is_match(line)
        || TASK_LIST_RE.is_match(line)
        || LINK_DEF_RE.is_match(line)
    {
        return true;
    }
    false
}

struct ParsedHeading {
    block: HeadingBlockInfo,
    next_index: usize,
}

#[derive(Clone, Debug)]
struct HeadingBlockInfo {
    line_range: LineRange,
    level: u32,
    style: String,
    text: String,
}

fn parse_heading(lines: &[String], index: usize) -> Option<ParsedHeading> {
    let line = lines.get(index)?;
    if let Some(captures) = ATX_HEADING_RE.captures(line) {
        let hashes = captures.get(1)?.as_str();
        let level = hashes.len() as u32;
        if level == 0 {
            return None;
        }
        let raw_text = captures.get(2).map(|m| m.as_str()).unwrap_or("");
        let stripped = strip_trailing_atx_hashes(raw_text);
        let normalized = normalize_heading_text(&stripped);
        return Some(ParsedHeading {
            block: HeadingBlockInfo {
                line_range: LineRange {
                    start: (index + 1) as u32,
                    end: (index + 1) as u32,
                },
                level,
                style: "atx".to_string(),
                text: normalized,
            },
            next_index: index + 1,
        });
    }

    let next_line = lines.get(index + 1)?;
    if SETEXT_HEADING_RE.is_match(next_line) {
        let level = if next_line.trim_start().starts_with('=') {
            1
        } else {
            2
        };
        let normalized = normalize_heading_text(line);
        return Some(ParsedHeading {
            block: HeadingBlockInfo {
                line_range: LineRange {
                    start: (index + 1) as u32,
                    end: (index + 2) as u32,
                },
                level,
                style: "setext".to_string(),
                text: normalized,
            },
            next_index: index + 2,
        });
    }

    None
}

struct ParsedFence {
    block: CodeFenceInfo,
    next_index: usize,
}

#[derive(Clone, Debug)]
struct CodeFenceInfo {
    line_range: LineRange,
    language: Option<String>,
    info_string: Option<String>,
    fence_char: char,
    fence_length: u32,
}

fn parse_code_fence(lines: &[String], index: usize) -> Option<ParsedFence> {
    let line = lines.get(index)?;
    let captures = CODE_FENCE_RE.captures(line)?;
    let fence_marker = captures.get(1)?.as_str();
    let info_string = captures.get(2).map(|m| m.as_str().trim().to_string());
    let fence_char = fence_marker.chars().next()?;
    let fence_length = fence_marker.len() as u32;
    let language = info_string
        .as_ref()
        .and_then(|info| info.split_whitespace().next().map(|s| s.to_string()))
        .filter(|value| !value.is_empty());

    let mut end_index = lines.len().saturating_sub(1);
    let fence_prefix = fence_char.to_string().repeat(3);
    for idx in (index + 1)..lines.len() {
        let candidate = lines[idx].trim();
        if !candidate.starts_with(&fence_prefix) {
            continue;
        }
        let match_len = candidate.chars().take_while(|c| *c == fence_char).count() as u32;
        if match_len >= fence_length {
            end_index = idx;
            break;
        }
    }

    Some(ParsedFence {
        block: CodeFenceInfo {
            line_range: LineRange {
                start: (index + 1) as u32,
                end: (end_index + 1) as u32,
            },
            language,
            info_string: info_string.filter(|info| !info.is_empty()),
            fence_char,
            fence_length,
        },
        next_index: end_index + 1,
    })
}

struct ParsedListBlock {
    range: LineRange,
    item_ranges: Vec<LineRange>,
    next_index: usize,
}

fn parse_list_block(lines: &[String], index: usize) -> Option<ParsedListBlock> {
    let line = lines.get(index)?;
    if !UNORDERED_LIST_RE.is_match(line)
        && !ORDERED_LIST_RE.is_match(line)
        && !TASK_LIST_RE.is_match(line)
    {
        return None;
    }
    let start = index;
    let mut end = index;
    let mut item_ranges = Vec::new();
    for idx in index..lines.len() {
        let current = &lines[idx];
        if current.trim().is_empty() {
            break;
        }
        if !UNORDERED_LIST_RE.is_match(current)
            && !ORDERED_LIST_RE.is_match(current)
            && !TASK_LIST_RE.is_match(current)
        {
            break;
        }
        item_ranges.push(LineRange {
            start: (idx + 1) as u32,
            end: (idx + 1) as u32,
        });
        end = idx;
    }
    Some(ParsedListBlock {
        range: LineRange {
            start: (start + 1) as u32,
            end: (end + 1) as u32,
        },
        item_ranges,
        next_index: end + 1,
    })
}

fn parse_indented_code(lines: &[String], index: usize) -> Option<LineRange> {
    let line = lines.get(index)?;
    if !line.starts_with("    ") && !line.starts_with('\t') {
        return None;
    }
    let start = index;
    let mut end = index;
    for idx in (index + 1)..lines.len() {
        let current = &lines[idx];
        if current.trim().is_empty() {
            break;
        }
        if !current.starts_with("    ") && !current.starts_with('\t') {
            break;
        }
        end = idx;
    }
    Some(LineRange {
        start: (start + 1) as u32,
        end: (end + 1) as u32,
    })
}

fn parse_table_block(lines: &[String], index: usize) -> Option<LineRange> {
    if index + 1 >= lines.len() {
        return None;
    }
    let header = &lines[index];
    let separator = &lines[index + 1];
    if !header.contains('|') || !TABLE_SEPARATOR_RE.is_match(separator) {
        return None;
    }
    let start = index;
    let mut end = index + 1;
    for idx in (index + 2)..lines.len() {
        let current = &lines[idx];
        if current.trim().is_empty() || !current.contains('|') {
            break;
        }
        end = idx;
    }
    Some(LineRange {
        start: (start + 1) as u32,
        end: (end + 1) as u32,
    })
}

// =============================================================================
// Operations
// =============================================================================

fn apply_markdown_ops_internal(
    content: &str,
    envelope: &MarkdownOperationEnvelope,
    options: Option<&MarkdownApplyOptions>,
) -> MarkdownLineApplyResult {
    if envelope.mode != "markdown" {
        return MarkdownLineApplyResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Envelope mode must be markdown".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }
    if envelope.preconditions.is_empty() || envelope.ops.is_empty() {
        return MarkdownLineApplyResult::Err {
            ok: false,
            error: MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Preconditions and ops must be non-empty".to_string(),
                precondition_id: None,
                op_index: None,
            },
        };
    }

    let normalized = normalize_line_endings(content);
    let mut lines: Vec<String> = normalized.split('\n').map(str::to_string).collect();
    let line_count = lines.len();

    let precondition_map = match build_precondition_map(&envelope.preconditions) {
        Ok(value) => value,
        Err(error) => {
            return MarkdownLineApplyResult::Err { ok: false, error };
        }
    };

    let semantic_index = build_semantic_index(&lines);

    let resolved_preconditions = match resolve_preconditions(
        &envelope.preconditions,
        &lines,
        &semantic_index,
        options.and_then(|opts| opts.targeting_policy.as_ref()),
    ) {
        Ok(value) => value,
        Err(error) => {
            return MarkdownLineApplyResult::Err { ok: false, error };
        }
    };

    let resolved_ops = match resolve_operations(
        &envelope.ops,
        &precondition_map,
        &resolved_preconditions,
        line_count,
        &semantic_index,
        options.and_then(|opts| opts.targeting_policy.as_ref()),
        semantic_index.frontmatter.as_ref().map(|fm| fm.line_range.clone()),
    ) {
        Ok(value) => value,
        Err(error) => {
            return MarkdownLineApplyResult::Err { ok: false, error };
        }
    };

    if let Some(error) = find_overlap(&resolved_ops) {
        return MarkdownLineApplyResult::Err { ok: false, error };
    }

    let apply_result = apply_resolved_operations(&mut lines, &resolved_ops, options);
    if let Err(error) = apply_result {
        return MarkdownLineApplyResult::Err { ok: false, error };
    }

    let applied: Vec<MarkdownAppliedOperation> = resolved_ops
        .iter()
        .map(|resolved| MarkdownAppliedOperation {
            op_index: resolved.op_index as u32,
            op: resolved.op.clone(),
            resolved_range: resolved.resolved_range.clone(),
        })
        .collect();

    MarkdownLineApplyResult::Ok {
        ok: true,
        content: lines.join("\n"),
        applied,
    }
}

fn build_precondition_map(
    preconditions: &[MarkdownPreconditionV1],
) -> Result<BTreeMap<String, MarkdownPreconditionV1>, MarkdownOperationError> {
    let mut map = BTreeMap::new();
    for precondition in preconditions {
        if precondition.v != 1 || precondition.mode != "markdown" {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Unsupported precondition format".to_string(),
                precondition_id: Some(precondition.id.clone()),
                op_index: None,
            });
        }
        if precondition.id.is_empty() {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Precondition id is required".to_string(),
                precondition_id: None,
                op_index: None,
            });
        }
        if map.contains_key(&precondition.id) {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: format!("Duplicate precondition id: {}", precondition.id),
                precondition_id: Some(precondition.id.clone()),
                op_index: None,
            });
        }
        map.insert(precondition.id.clone(), precondition.clone());
    }
    Ok(map)
}

fn resolve_preconditions(
    preconditions: &[MarkdownPreconditionV1],
    lines: &[String],
    semantic_index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> Result<BTreeMap<String, LineRange>, MarkdownOperationError> {
    let mut resolved = BTreeMap::new();
    for precondition in preconditions {
        let range =
            resolve_precondition_range(precondition, semantic_index, policy, lines.len())?;
        if let Some(error) = validate_precondition_policy(precondition, policy) {
            return Err(error);
        }
        if let Some(error_message) =
            validate_context_prefix(precondition, &range, lines, policy)
        {
            return Err(MarkdownOperationError {
                code: "MCM_PRECONDITION_FAILED".to_string(),
                message: error_message,
                precondition_id: Some(precondition.id.clone()),
                op_index: None,
            });
        }
        if let Some(error) = validate_content_hash(precondition, &range, lines) {
            return Err(error);
        }
        resolved.insert(precondition.id.clone(), range);
    }
    Ok(resolved)
}

fn resolve_precondition_range(
    precondition: &MarkdownPreconditionV1,
    semantic_index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
    line_count: usize,
) -> Result<LineRange, MarkdownOperationError> {
    if precondition.line_range.is_none() && precondition.semantic.is_none() {
        return Err(MarkdownOperationError {
            code: "MCM_PRECONDITION_FAILED".to_string(),
            message: "Line range or semantic target required".to_string(),
            precondition_id: Some(precondition.id.clone()),
            op_index: None,
        });
    }

    let mut resolved_range: Option<LineRange> = None;

    if let Some(semantic) = precondition.semantic.as_ref() {
        let semantic_result = resolve_semantic_target(semantic, semantic_index, policy);
        let semantic_range = match semantic_result {
            MarkdownSemanticResolutionResult::Ok { range, .. } => range,
            MarkdownSemanticResolutionResult::Err { error, .. } => {
                return Err(MarkdownOperationError {
                    code: error.code,
                    message: error.message,
                    precondition_id: Some(precondition.id.clone()),
                    op_index: None,
                })
            }
        };
        resolved_range = Some(semantic_range);
    }

    if let Some(explicit) = precondition.line_range.as_ref() {
        validate_line_range(explicit, line_count).map_err(|mut err| {
            err.precondition_id = Some(precondition.id.clone());
            err
        })?;
        if let Some(existing) = resolved_range.as_ref() {
            if existing.start != explicit.start || existing.end != explicit.end {
                return Err(MarkdownOperationError {
                    code: "MCM_PRECONDITION_FAILED".to_string(),
                    message: "Line range does not match semantic target".to_string(),
                    precondition_id: Some(precondition.id.clone()),
                    op_index: None,
                });
            }
        }
        resolved_range = Some(explicit.clone());
    }

    Ok(resolved_range.expect("resolved range should exist"))
}

fn validate_precondition_policy(
    precondition: &MarkdownPreconditionV1,
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> Option<MarkdownOperationError> {
    if let Some(policy) = policy {
        if policy.require_content_hash && precondition.content_hash.is_none() {
            return Some(MarkdownOperationError {
                code: "MCM_PRECONDITION_FAILED".to_string(),
                message: "Content hash required by policy".to_string(),
                precondition_id: Some(precondition.id.clone()),
                op_index: None,
            });
        }
        if policy.require_context && precondition.context.is_none() {
            return Some(MarkdownOperationError {
                code: "MCM_PRECONDITION_FAILED".to_string(),
                message: "Context required by policy".to_string(),
                precondition_id: Some(precondition.id.clone()),
                op_index: None,
            });
        }
    }
    None
}

fn validate_context_prefix(
    precondition: &MarkdownPreconditionV1,
    range: &LineRange,
    lines: &[String],
    policy: Option<&MarkdownTargetingPolicyV1>,
) -> Option<String> {
    let context = precondition.context.as_ref()?;
    if let Some(prefix) = context.line_before_prefix.as_ref() {
        if let Some(limit) = policy.map(|p| p.max_context_prefix_chars) {
            if prefix.len() > limit as usize {
                return Some("Context prefix exceeds policy max length".to_string());
            }
        }
        let before_index = range.start.saturating_sub(2) as isize;
        if before_index < 0 {
            return Some("Context line_before_prefix is out of bounds".to_string());
        }
        if let Some(line) = lines.get(before_index as usize) {
            if !line.starts_with(prefix) {
                return Some("Context line_before_prefix mismatch".to_string());
            }
        }
    }
    if let Some(prefix) = context.line_after_prefix.as_ref() {
        if let Some(limit) = policy.map(|p| p.max_context_prefix_chars) {
            if prefix.len() > limit as usize {
                return Some("Context prefix exceeds policy max length".to_string());
            }
        }
        let after_index = range.end as usize;
        if after_index >= lines.len() {
            return Some("Context line_after_prefix is out of bounds".to_string());
        }
        if let Some(line) = lines.get(after_index) {
            if !line.starts_with(prefix) {
                return Some("Context line_after_prefix mismatch".to_string());
            }
        }
    }
    None
}

fn validate_content_hash(
    precondition: &MarkdownPreconditionV1,
    range: &LineRange,
    lines: &[String],
) -> Option<MarkdownOperationError> {
    let expected = precondition.content_hash.as_ref()?;
    let computed = compute_line_hash(lines, range);
    if &computed != expected {
        return Some(MarkdownOperationError {
            code: "MCM_CONTENT_HASH_MISMATCH".to_string(),
            message: "Content hash mismatch".to_string(),
            precondition_id: Some(precondition.id.clone()),
            op_index: None,
        });
    }
    None
}

fn resolve_operations(
    ops: &[MarkdownOperation],
    preconditions: &BTreeMap<String, MarkdownPreconditionV1>,
    resolved_ranges: &BTreeMap<String, LineRange>,
    line_count: usize,
    semantic_index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
    frontmatter_range: Option<LineRange>,
) -> Result<Vec<ResolvedOperation>, MarkdownOperationError> {
    let mut resolved_ops = Vec::new();
    let mut used_preconditions = BTreeMap::new();

    for (index, op) in ops.iter().enumerate() {
        let precondition_id = op.precondition_id();
        if used_preconditions.contains_key(precondition_id) {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: format!("Duplicate precondition_id in ops: {precondition_id}"),
                precondition_id: Some(precondition_id.to_string()),
                op_index: Some(index as u32),
            });
        }
        used_preconditions.insert(precondition_id.to_string(), true);
        let precondition = preconditions.get(precondition_id).ok_or_else(|| MarkdownOperationError {
            code: "MCM_PRECONDITION_FAILED".to_string(),
            message: format!("Missing precondition for {precondition_id}"),
            precondition_id: Some(precondition_id.to_string()),
            op_index: Some(index as u32),
        })?;
        let resolved_range = resolved_ranges
            .get(precondition_id)
            .cloned()
            .ok_or_else(|| MarkdownOperationError {
                code: "MCM_PRECONDITION_FAILED".to_string(),
                message: format!("Missing resolved range for {precondition_id}"),
                precondition_id: Some(precondition_id.to_string()),
                op_index: Some(index as u32),
            })?;

        let resolved = resolve_operation(
            op,
            precondition,
            resolved_range,
            line_count,
            semantic_index,
            policy,
            index,
            frontmatter_range.clone(),
        )?;
        resolved_ops.push(resolved);
    }

    Ok(resolved_ops)
}

fn resolve_operation(
    op: &MarkdownOperation,
    _precondition: &MarkdownPreconditionV1,
    resolved_range: LineRange,
    line_count: usize,
    semantic_index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
    op_index: usize,
    frontmatter_range: Option<LineRange>,
) -> Result<ResolvedOperation, MarkdownOperationError> {
    match op {
        MarkdownOperation::ReplaceLines(inner) => {
            let range = inner.target.line_range.clone();
            validate_line_range(&range, line_count).map_err(|mut err| {
                err.precondition_id = Some(inner.precondition_id.clone());
                err.op_index = Some(op_index as u32);
                err
            })?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range,
                insert_index: None,
            })
        }
        MarkdownOperation::DeleteLines(inner) => {
            let range = inner.target.line_range.clone();
            validate_line_range(&range, line_count).map_err(|mut err| {
                err.precondition_id = Some(inner.precondition_id.clone());
                err.op_index = Some(op_index as u32);
                err
            })?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range,
                insert_index: None,
            })
        }
        MarkdownOperation::InsertLines(inner) => {
            let anchor = inner
                .target
                .after_line
                .or(inner.target.before_line)
                .ok_or_else(|| MarkdownOperationError {
                    code: "MCM_INVALID_RANGE".to_string(),
                    message: "Insertion anchor must be provided".to_string(),
                    precondition_id: Some(inner.precondition_id.clone()),
                    op_index: Some(op_index as u32),
                })?;
            if anchor == 0 || anchor as usize > line_count {
                return Err(MarkdownOperationError {
                    code: "MCM_INVALID_RANGE".to_string(),
                    message: "Insertion anchor is out of bounds".to_string(),
                    precondition_id: Some(inner.precondition_id.clone()),
                    op_index: Some(op_index as u32),
                });
            }
            let anchor_range = LineRange {
                start: anchor,
                end: anchor,
            };
            ensure_range_match(
                &resolved_range,
                &anchor_range,
                inner.precondition_id.as_str(),
                op_index,
            )?;
            let insert_index = if inner.target.after_line.is_some() {
                anchor as usize
            } else {
                anchor.saturating_sub(1) as usize
            };
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: anchor_range,
                insert_index: Some(insert_index),
            })
        }
        MarkdownOperation::ReplaceBlock(inner) => {
            let range = resolve_block_target(
                &inner.target,
                semantic_index,
                policy,
                inner.precondition_id.as_str(),
                op_index,
            )?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range,
                insert_index: None,
            })
        }
        MarkdownOperation::InsertAfter(inner) => {
            let range = resolve_block_target(
                &inner.target,
                semantic_index,
                policy,
                inner.precondition_id.as_str(),
                op_index,
            )?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range.clone(),
                insert_index: Some(range.end as usize),
            })
        }
        MarkdownOperation::InsertBefore(inner) => {
            let range = resolve_block_target(
                &inner.target,
                semantic_index,
                policy,
                inner.precondition_id.as_str(),
                op_index,
            )?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range.clone(),
                insert_index: Some(range.start.saturating_sub(1) as usize),
            })
        }
        MarkdownOperation::InsertCodeFence(inner) => {
            let range = resolve_block_target(
                &inner.target,
                semantic_index,
                policy,
                inner.precondition_id.as_str(),
                op_index,
            )?;
            ensure_range_match(&resolved_range, &range, inner.precondition_id.as_str(), op_index)?;
            validate_code_fence_options(inner, op_index)?;
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range: range.clone(),
                insert_index: Some(range.end as usize),
            })
        }
        MarkdownOperation::UpdateFrontmatter(inner) => {
            if let Some(frontmatter_range) = frontmatter_range.as_ref() {
                if frontmatter_range.start != resolved_range.start
                    || frontmatter_range.end != resolved_range.end
                {
                    return Err(MarkdownOperationError {
                        code: "MCM_PRECONDITION_FAILED".to_string(),
                        message: "Frontmatter update requires frontmatter precondition range"
                            .to_string(),
                        precondition_id: Some(inner.precondition_id.clone()),
                        op_index: Some(op_index as u32),
                    });
                }
            }
            Ok(ResolvedOperation {
                op_index,
                op: op.clone(),
                resolved_range,
                insert_index: None,
            })
        }
    }
}

fn resolve_block_target(
    target: &BlockTarget,
    semantic_index: &MarkdownSemanticIndex,
    policy: Option<&MarkdownTargetingPolicyV1>,
    precondition_id: &str,
    op_index: usize,
) -> Result<LineRange, MarkdownOperationError> {
    if target.block_id.is_some() {
        return Err(MarkdownOperationError {
            code: "MCM_INVALID_TARGET".to_string(),
            message: "block_id targeting is not supported for markdown operations".to_string(),
            precondition_id: Some(precondition_id.to_string()),
            op_index: Some(op_index as u32),
        });
    }
    let semantic = target.semantic.as_ref().ok_or_else(|| MarkdownOperationError {
        code: "MCM_INVALID_TARGET".to_string(),
        message: "Semantic target is required".to_string(),
        precondition_id: Some(precondition_id.to_string()),
        op_index: Some(op_index as u32),
    })?;
    let semantic_result = resolve_semantic_target(semantic, semantic_index, policy);
    match semantic_result {
        MarkdownSemanticResolutionResult::Ok { range, .. } => Ok(range),
        MarkdownSemanticResolutionResult::Err { error, .. } => Err(MarkdownOperationError {
            code: error.code,
            message: error.message,
            precondition_id: Some(precondition_id.to_string()),
            op_index: Some(op_index as u32),
        }),
    }
}

fn ensure_range_match(
    resolved: &LineRange,
    target: &LineRange,
    precondition_id: &str,
    op_index: usize,
) -> Result<(), MarkdownOperationError> {
    if resolved.start != target.start || resolved.end != target.end {
        return Err(MarkdownOperationError {
            code: "MCM_PRECONDITION_FAILED".to_string(),
            message: "Operation target does not match precondition range".to_string(),
            precondition_id: Some(precondition_id.to_string()),
            op_index: Some(op_index as u32),
        });
    }
    Ok(())
}

fn validate_code_fence_options(
    op: &MdInsertCodeFence,
    op_index: usize,
) -> Result<(), MarkdownOperationError> {
    if let Some(fence_char) = op.fence_char.as_ref() {
        if fence_char != "`" && fence_char != "~" {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Fence character must be ` or ~".to_string(),
                precondition_id: Some(op.precondition_id.clone()),
                op_index: Some(op_index as u32),
            });
        }
    }
    if let Some(length) = op.fence_length {
        if length < 3 {
            return Err(MarkdownOperationError {
                code: "MCM_INVALID_REQUEST".to_string(),
                message: "Fence length must be at least 3".to_string(),
                precondition_id: Some(op.precondition_id.clone()),
                op_index: Some(op_index as u32),
            });
        }
    }
    Ok(())
}

fn apply_resolved_operations(
    lines: &mut Vec<String>,
    ops: &[ResolvedOperation],
    options: Option<&MarkdownApplyOptions>,
) -> Result<(), MarkdownOperationError> {
    let mut sorted = ops.to_vec();
    sorted.sort_by(|a, b| {
        if a.resolved_range.start != b.resolved_range.start {
            return b.resolved_range.start.cmp(&a.resolved_range.start);
        }
        b.resolved_range.end.cmp(&a.resolved_range.end)
    });

    for resolved in sorted.iter() {
        apply_resolved_operation(lines, resolved, options)?;
    }
    Ok(())
}

fn apply_resolved_operation(
    lines: &mut Vec<String>,
    resolved: &ResolvedOperation,
    options: Option<&MarkdownApplyOptions>,
) -> Result<(), MarkdownOperationError> {
    match &resolved.op {
        MarkdownOperation::ReplaceLines(op) => {
            let replacement = split_markdown_lines(op.content.clone());
            apply_replace(lines, &resolved.resolved_range, replacement);
        }
        MarkdownOperation::DeleteLines(_op) => {
            apply_delete(lines, &resolved.resolved_range);
            if lines.is_empty() {
                lines.push(String::new());
            }
        }
        MarkdownOperation::InsertLines(op) => {
            let insertion = split_markdown_lines(op.content.clone());
            apply_insert(lines, resolved.insert_index.unwrap_or(0), insertion);
        }
        MarkdownOperation::ReplaceBlock(op) => {
            let replacement = split_markdown_lines(op.content.clone());
            apply_replace(lines, &resolved.resolved_range, replacement);
        }
        MarkdownOperation::InsertAfter(op) => {
            let insertion = split_markdown_lines(op.content.clone());
            apply_insert(lines, resolved.insert_index.unwrap_or(0), insertion);
        }
        MarkdownOperation::InsertBefore(op) => {
            let insertion = split_markdown_lines(op.content.clone());
            apply_insert(lines, resolved.insert_index.unwrap_or(0), insertion);
        }
        MarkdownOperation::InsertCodeFence(op) => {
            let fence_lines = build_code_fence_lines(op)?;
            apply_insert(lines, resolved.insert_index.unwrap_or(0), fence_lines);
        }
        MarkdownOperation::UpdateFrontmatter(op) => {
            apply_frontmatter_update(lines, op, options.and_then(|opts| opts.frontmatter_policy.as_ref()))?;
        }
    }
    Ok(())
}

fn apply_replace(lines: &mut Vec<String>, range: &LineRange, replacement: Vec<String>) {
    let start = range.start.saturating_sub(1) as usize;
    let delete_count = range.end.saturating_sub(range.start).saturating_add(1) as usize;
    lines.splice(start..start + delete_count, replacement);
}

fn apply_delete(lines: &mut Vec<String>, range: &LineRange) {
    let start = range.start.saturating_sub(1) as usize;
    let delete_count = range.end.saturating_sub(range.start).saturating_add(1) as usize;
    lines.drain(start..start + delete_count);
}

fn apply_insert(lines: &mut Vec<String>, index: usize, insertion: Vec<String>) {
    let idx = index.min(lines.len());
    lines.splice(idx..idx, insertion);
}

fn build_code_fence_lines(op: &MdInsertCodeFence) -> Result<Vec<String>, MarkdownOperationError> {
    let fence_char = op.fence_char.clone().unwrap_or_else(|| "`".to_string());
    let fence_length = op.fence_length.unwrap_or(3).max(3);
    let fence = fence_char.repeat(fence_length as usize);
    let language = op.language.as_ref().map(|value| value.trim()).unwrap_or("");
    let opening = if language.is_empty() {
        fence.clone()
    } else {
        format!("{fence}{language}")
    };
    let content_lines = split_markdown_lines(op.content.clone());
    let mut result = Vec::with_capacity(content_lines.len() + 2);
    result.push(opening);
    result.extend(content_lines);
    result.push(fence);
    Ok(result)
}

fn apply_frontmatter_update(
    lines: &mut Vec<String>,
    op: &MdUpdateFrontmatter,
    policy: Option<&MarkdownFrontmatterPolicy>,
) -> Result<(), MarkdownOperationError> {
    let policy = policy.ok_or_else(|| MarkdownOperationError {
        code: "MCM_FRONTMATTER_INVALID".to_string(),
        message: "Frontmatter updates are not allowed".to_string(),
        precondition_id: Some(op.precondition_id.clone()),
        op_index: None,
    })?;
    if !policy.allow_frontmatter {
        return Err(MarkdownOperationError {
            code: "MCM_FRONTMATTER_INVALID".to_string(),
            message: "Frontmatter updates are not allowed".to_string(),
            precondition_id: Some(op.precondition_id.clone()),
            op_index: None,
        });
    }

    let existing = parse_frontmatter(lines)?;
    let (syntax, data, existing_range) = match existing {
        Some(context) => {
            if !policy.frontmatter_formats.contains(&context.syntax) {
                return Err(MarkdownOperationError {
                    code: "MCM_FRONTMATTER_INVALID".to_string(),
                    message: "Frontmatter format is not allowed".to_string(),
                    precondition_id: Some(op.precondition_id.clone()),
                    op_index: None,
                });
            }
            (context.syntax, context.data, Some(context.existing_range))
        }
        None => {
            if !op.create_if_missing.unwrap_or(false) {
                return Err(MarkdownOperationError {
                    code: "MCM_TARGETING_NOT_FOUND".to_string(),
                    message: "Frontmatter not found".to_string(),
                    precondition_id: Some(op.precondition_id.clone()),
                    op_index: None,
                });
            }
            let default_format = policy.frontmatter_formats.first().cloned().ok_or_else(|| {
                MarkdownOperationError {
                    code: "MCM_FRONTMATTER_INVALID".to_string(),
                    message: "No frontmatter formats available".to_string(),
                    precondition_id: Some(op.precondition_id.clone()),
                    op_index: None,
                }
            })?;
            if !policy.frontmatter_formats.contains(&default_format) {
                return Err(MarkdownOperationError {
                    code: "MCM_FRONTMATTER_INVALID".to_string(),
                    message: "Frontmatter format is not allowed".to_string(),
                    precondition_id: Some(op.precondition_id.clone()),
                    op_index: None,
                });
            }
            (default_format, Value::Object(serde_json::Map::new()), None)
        }
    };

    let updated = update_frontmatter_value(&data, &op.target.key_path, op.value.clone(), op.create_if_missing.unwrap_or(false))?;
    let serialized = stringify_frontmatter(&updated, &syntax)?;
    let frontmatter_lines = build_known_frontmatter_lines(&syntax, &serialized);
    if let Some(limit) = policy.max_frontmatter_bytes {
        let byte_len = frontmatter_lines.join("\n").as_bytes().len() as u32;
        if byte_len > limit {
            return Err(MarkdownOperationError {
                code: "MCM_LINE_LIMIT_EXCEEDED".to_string(),
                message: "Frontmatter size exceeds policy limit".to_string(),
                precondition_id: Some(op.precondition_id.clone()),
                op_index: None,
            });
        }
    }

    if let Some(range) = existing_range {
        let start = range.start.saturating_sub(1) as usize;
        let delete_count = range.end.saturating_sub(range.start).saturating_add(1) as usize;
        lines.splice(start..start + delete_count, frontmatter_lines);
    } else {
        lines.splice(0..0, frontmatter_lines);
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct FrontmatterContext {
    syntax: String,
    data: Value,
    existing_range: LineRange,
}

fn compute_block_id(block_type: &str, range: &LineRange, lines: &[String]) -> String {
    let content_hash = compute_line_hash(lines, range);
    let canonical = format!(
        "LFCC_MD_BLOCK_V1\ntype={}\nstart_line={}\nend_line={}\ncontent_hash={}",
        block_type, range.start, range.end, content_hash
    );
    sha256_hex(&canonical)
}

fn find_overlap(ops: &[ResolvedOperation]) -> Option<MarkdownOperationError> {
    if ops.len() < 2 {
        return None;
    }
    let mut sorted = ops.to_vec();
    sorted.sort_by(|a, b| {
        if a.resolved_range.start != b.resolved_range.start {
            return a.resolved_range.start.cmp(&b.resolved_range.start);
        }
        a.resolved_range.end.cmp(&b.resolved_range.end)
    });
    for window in sorted.windows(2) {
        let prev = &window[0];
        let current = &window[1];
        if ranges_overlap(&prev.resolved_range, &current.resolved_range) {
            return Some(MarkdownOperationError {
                code: "MCM_OPERATION_OVERLAP".to_string(),
                message: "Resolved line ranges overlap".to_string(),
                precondition_id: Some(current.op.precondition_id().to_string()),
                op_index: Some(current.op_index as u32),
            });
        }
    }
    None
}

fn ranges_overlap(a: &LineRange, b: &LineRange) -> bool {
    a.start <= b.end && b.start <= a.end
}

trait OperationMeta {
    fn precondition_id(&self) -> &str;
}

impl OperationMeta for MarkdownOperation {
    fn precondition_id(&self) -> &str {
        match self {
            MarkdownOperation::ReplaceLines(op) => &op.precondition_id,
            MarkdownOperation::InsertLines(op) => &op.precondition_id,
            MarkdownOperation::DeleteLines(op) => &op.precondition_id,
            MarkdownOperation::ReplaceBlock(op) => &op.precondition_id,
            MarkdownOperation::UpdateFrontmatter(op) => &op.precondition_id,
            MarkdownOperation::InsertAfter(op) => &op.precondition_id,
            MarkdownOperation::InsertBefore(op) => &op.precondition_id,
            MarkdownOperation::InsertCodeFence(op) => &op.precondition_id,
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_hash_uses_canonical_string() {
        let lines = vec!["alpha".to_string(), "bravo".to_string()];
        let range = LineRange { start: 2, end: 2 };
        let expected = sha256_hex("LFCC_MD_LINE_V1\nstart=2\nend=2\ntext=bravo");
        assert_eq!(compute_line_hash(&lines, &range), expected);
    }

    #[test]
    fn content_hash_ignores_frontmatter() {
        let content = "---\nname: Test\n---\nBody";
        let hash_ignore = compute_content_hash(content, true);
        let normalized = normalize_line_endings("Body");
        let canonical = format!(
            "LFCC_MD_CONTENT_V1\nignore_frontmatter=true\ntext={}",
            normalized
        );
        let expected = sha256_hex(&canonical);
        assert_eq!(hash_ignore, expected);
    }

    #[test]
    fn frontmatter_update_rewrites_value() {
        let content = "---\nname: Old\n---\nBody";
        let envelope = MarkdownOperationEnvelope {
            mode: "markdown".to_string(),
            doc_id: "doc-1".to_string(),
            doc_frontier: "frontier:1".to_string(),
            request_id: None,
            agent_id: None,
            preconditions: vec![MarkdownPreconditionV1 {
                v: 1,
                mode: "markdown".to_string(),
                id: "p1".to_string(),
                block_id: None,
                line_range: Some(LineRange { start: 1, end: 3 }),
                semantic: Some(MarkdownSemanticTarget {
                    kind: "frontmatter".to_string(),
                    heading_text: None,
                    heading_text_mode: None,
                    heading_level: None,
                    language: None,
                    after_heading: None,
                    after_heading_mode: None,
                    key_path: None,
                    nth: None,
                }),
                content_hash: None,
                context: None,
            }],
            ops: vec![MarkdownOperation::UpdateFrontmatter(MdUpdateFrontmatter {
                precondition_id: "p1".to_string(),
                target: FrontmatterTarget {
                    key_path: vec!["name".to_string()],
                },
                value: Value::String("New".to_string()),
                create_if_missing: Some(true),
            })],
            options: None,
        };
        let options = MarkdownApplyOptions {
            targeting_policy: None,
            frontmatter_policy: Some(MarkdownFrontmatterPolicy {
                allow_frontmatter: true,
                frontmatter_formats: vec!["yaml".to_string()],
                max_frontmatter_bytes: None,
            }),
        };
        let result = apply_markdown_ops_internal(content, &envelope, Some(&options));
        match result {
            MarkdownLineApplyResult::Ok { content, .. } => {
                assert!(content.contains("name: New"));
                assert!(content.starts_with("---"));
            }
            _ => panic!("frontmatter update failed"),
        }
    }
}
