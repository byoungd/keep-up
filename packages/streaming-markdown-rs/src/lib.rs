use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

static CODE_BLOCK_END_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^```\s*$").unwrap());
static CODE_BLOCK_START_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^```(\w*)$").unwrap());
static HEADING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(#{1,6})\s+(.+)$").unwrap());
static HORIZONTAL_RULE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:---|\*\*\*|___)$").unwrap());
static TASK_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[-*+]\s+\[([ xX])\]\s+(.*)$").unwrap());
static UNORDERED_LIST_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[-*+]\s+(.*)$").unwrap());
static ORDERED_LIST_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d+)\.\s+(.*)$").unwrap());
static BLOCKQUOTE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^>\s*(.*)$").unwrap());
static TABLE_SEPARATOR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[\s|:-]+$").unwrap());
static BLOCK_START_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(#{1,6}\s|[-*+]\s|>\s|\d+\.\s|```|---|\*\*\*|___|$)").unwrap()
});

static STRONG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\*\*([^*]+)\*\*").unwrap());
static EMPHASIS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\*([^*]+)\*").unwrap());
static CODE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"`([^`]+)`").unwrap());
static STRIKETHROUGH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"~~([^~]+)~~").unwrap());
static LINK_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum NodeType {
    Paragraph,
    Heading,
    CodeBlock,
    Blockquote,
    List,
    ListItem,
    TaskItem,
    HorizontalRule,
    Table,
    TableRow,
    TableCell,
    Text,
    Strong,
    Emphasis,
    Code,
    Link,
    Image,
    Strikethrough,
    HardBreak,
}

#[derive(Clone, Debug, Serialize)]
struct NodePosition {
    start: usize,
    end: usize,
}

#[derive(Clone, Debug, Serialize)]
struct ASTNode {
    #[serde(rename = "type")]
    node_type: NodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<ASTNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attrs: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<NodePosition>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum ListType {
    Bullet,
    Ordered,
    Task,
}

#[derive(Clone, Debug, Serialize)]
struct ListStackEntry {
    #[serde(rename = "type")]
    list_type: ListType,
    indent: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParserStateSnapshot {
    in_code_block: bool,
    code_block_lang: String,
    list_stack: Vec<ListStackEntry>,
    open_markers: Vec<String>,
    buffer_offset: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseResult {
    nodes: Vec<ASTNode>,
    pending: String,
    state: ParserStateSnapshot,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStats {
    hits: u64,
    misses: u64,
    ratio: f64,
}

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParserOptions {
    gfm: Option<bool>,
    math: Option<bool>,
    max_buffer_size: Option<usize>,
}

#[derive(Clone, Debug)]
struct ParserOptionsResolved {
    gfm: bool,
    math: bool,
    max_buffer_size: usize,
}

impl ParserOptionsResolved {
    fn from_options(options: Option<ParserOptions>) -> Self {
        let options = options.unwrap_or_default();
        Self {
            gfm: options.gfm.unwrap_or(true),
            math: options.math.unwrap_or(false),
            max_buffer_size: options.max_buffer_size.unwrap_or(10_000),
        }
    }
}

#[derive(Clone, Debug)]
struct StreamingMarkdownParserCore {
    buffer: String,
    options: ParserOptionsResolved,
    state: ParserStateSnapshot,
    cache: HashMap<String, Vec<ASTNode>>,
    cache_hits: u64,
    cache_misses: u64,
}

impl StreamingMarkdownParserCore {
    fn new(options: ParserOptionsResolved) -> Self {
        Self {
            buffer: String::new(),
            options,
            state: ParserStateSnapshot {
                in_code_block: false,
                code_block_lang: String::new(),
                list_stack: Vec::new(),
                open_markers: Vec::new(),
                buffer_offset: 0,
            },
            cache: HashMap::new(),
            cache_hits: 0,
            cache_misses: 0,
        }
    }

    fn push(&mut self, chunk: &str) -> ParseResult {
        self.buffer.push_str(chunk);

        if self.buffer.len() > self.options.max_buffer_size {
            return self.flush();
        }

        if self.state.in_code_block {
            return self.parse_in_code_block();
        }

        let boundary = self.find_safe_boundary();
        if boundary.is_none() {
            return ParseResult {
                nodes: Vec::new(),
                pending: self.buffer.clone(),
                state: self.state.clone(),
            };
        }

        let boundary = boundary.expect("boundary should exist");
        let complete = self.buffer[..boundary].to_string();
        self.buffer = self.buffer[boundary..].to_string();

        let nodes = self.parse_blocks(&complete);

        ParseResult {
            nodes,
            pending: self.buffer.clone(),
            state: self.state.clone(),
        }
    }

    fn flush(&mut self) -> ParseResult {
        if self.state.in_code_block {
            let node = self.create_code_block_node(
                self.buffer.clone(),
                self.state.code_block_lang.clone(),
                false,
            );
            self.buffer.clear();
            self.state.in_code_block = false;
            self.state.code_block_lang.clear();

            return ParseResult {
                nodes: vec![node],
                pending: String::new(),
                state: self.state.clone(),
            };
        }

        let buffer = std::mem::take(&mut self.buffer);
        let nodes = self.parse_blocks(&buffer);

        ParseResult {
            nodes,
            pending: String::new(),
            state: self.state.clone(),
        }
    }

    fn reset(&mut self) {
        self.buffer.clear();
        self.state = ParserStateSnapshot {
            in_code_block: false,
            code_block_lang: String::new(),
            list_stack: Vec::new(),
            open_markers: Vec::new(),
            buffer_offset: 0,
        };
        self.cache.clear();
        self.cache_hits = 0;
        self.cache_misses = 0;
    }

    fn get_cache_stats(&self) -> CacheStats {
        let total = self.cache_hits + self.cache_misses;
        CacheStats {
            hits: self.cache_hits,
            misses: self.cache_misses,
            ratio: if total > 0 {
                self.cache_hits as f64 / total as f64
            } else {
                0.0
            },
        }
    }

    fn find_safe_boundary(&self) -> Option<usize> {
        if let Some(double_newline) = self.buffer.rfind("\n\n") {
            return Some(double_newline + 2);
        }

        if let Some(last_newline) = self.buffer.rfind('\n') {
            if last_newline > 20 {
                let line = &self.buffer[..last_newline];
                if !self.has_open_markers(line) {
                    return Some(last_newline + 1);
                }
            }
        }

        None
    }

    fn has_open_markers(&self, text: &str) -> bool {
        const MARKERS: [&str; 5] = ["**", "*", "`", "[", "]("];
        for marker in MARKERS {
            let count = text.matches(marker).count();
            if count % 2 != 0 {
                return true;
            }
        }
        false
    }

    fn parse_in_code_block(&mut self) -> ParseResult {
        if let Some(matched) = CODE_BLOCK_END_RE.find(&self.buffer) {
            let content = self.buffer[..matched.start()].to_string();
            self.buffer = self.buffer[matched.end()..].to_string();
            self.state.in_code_block = false;

            let node = self.create_code_block_node(
                content,
                self.state.code_block_lang.clone(),
                false,
            );
            self.state.code_block_lang.clear();

            return ParseResult {
                nodes: vec![node],
                pending: self.buffer.clone(),
                state: self.state.clone(),
            };
        }

        let last_newline = self.buffer.rfind('\n');
        if last_newline.is_none() {
            return ParseResult {
                nodes: Vec::new(),
                pending: self.buffer.clone(),
                state: self.state.clone(),
            };
        }

        let last_newline = last_newline.expect("newline should exist");
        let content = self.buffer[..=last_newline].to_string();
        self.buffer = self.buffer[last_newline + 1..].to_string();

        ParseResult {
            nodes: vec![self.create_code_block_node(
                content,
                self.state.code_block_lang.clone(),
                true,
            )],
            pending: self.buffer.clone(),
            state: self.state.clone(),
        }
    }

    fn parse_blocks(&mut self, text: &str) -> Vec<ASTNode> {
        if text.trim().is_empty() {
            return Vec::new();
        }

        let cache_key: String = text.chars().take(100).collect();
        let cached = self.cache.get(&cache_key);
        if let Some(nodes) = cached {
            if text.len() < 200 {
                self.cache_hits += 1;
                return nodes.clone();
            }
        }
        self.cache_misses += 1;

        let mut nodes = Vec::new();
        let lines: Vec<&str> = text.split('\n').collect();
        let mut i = 0;

        while i < lines.len() {
            let line = lines[i];
            let trimmed = line.trim();

            if trimmed.is_empty() {
                i += 1;
                continue;
            }

            if let Some(captures) = CODE_BLOCK_START_RE.captures(trimmed) {
                self.state.in_code_block = true;
                self.state.code_block_lang = captures
                    .get(1)
                    .map_or("", |m| m.as_str())
                    .to_string();
                i += 1;
                continue;
            }

            if let Some(captures) = HEADING_RE.captures(trimmed) {
                let level = captures.get(1).map_or(1usize, |m| m.as_str().len());
                let content = captures.get(2).map_or("", |m| m.as_str());
                nodes.push(ASTNode {
                    node_type: NodeType::Heading,
                    content: None,
                    children: Some(self.parse_inline(content)),
                    attrs: Some(json!({ "level": level })),
                    position: None,
                });
                i += 1;
                continue;
            }

            if HORIZONTAL_RULE_RE.is_match(trimmed) {
                nodes.push(ASTNode {
                    node_type: NodeType::HorizontalRule,
                    content: None,
                    children: None,
                    attrs: None,
                    position: None,
                });
                i += 1;
                continue;
            }

            if let Some(captures) = TASK_RE.captures(trimmed) {
                let checked = captures
                    .get(1)
                    .map_or("", |m| m.as_str())
                    .to_lowercase()
                    == "x";
                let content = captures.get(2).map_or("", |m| m.as_str());
                nodes.push(ASTNode {
                    node_type: NodeType::TaskItem,
                    content: None,
                    children: Some(self.parse_inline(content)),
                    attrs: Some(json!({ "checked": checked })),
                    position: None,
                });
                i += 1;
                continue;
            }

            if let Some(captures) = UNORDERED_LIST_RE.captures(trimmed) {
                let content = captures.get(1).map_or("", |m| m.as_str());
                nodes.push(ASTNode {
                    node_type: NodeType::ListItem,
                    content: None,
                    children: Some(self.parse_inline(content)),
                    attrs: Some(json!({ "listType": "bullet" })),
                    position: None,
                });
                i += 1;
                continue;
            }

            if let Some(captures) = ORDERED_LIST_RE.captures(trimmed) {
                let start = captures
                    .get(1)
                    .and_then(|m| m.as_str().parse::<u32>().ok())
                    .unwrap_or(1);
                let content = captures.get(2).map_or("", |m| m.as_str());
                nodes.push(ASTNode {
                    node_type: NodeType::ListItem,
                    content: None,
                    children: Some(self.parse_inline(content)),
                    attrs: Some(json!({ "listType": "ordered", "start": start })),
                    position: None,
                });
                i += 1;
                continue;
            }

            if let Some(captures) = BLOCKQUOTE_RE.captures(trimmed) {
                let content = captures.get(1).map_or("", |m| m.as_str());
                nodes.push(ASTNode {
                    node_type: NodeType::Blockquote,
                    content: None,
                    children: Some(self.parse_inline(content)),
                    attrs: None,
                    position: None,
                });
                i += 1;
                continue;
            }

            if self.options.gfm && trimmed.contains('|') {
                if let Some((node, end_index)) = self.parse_table(&lines, i) {
                    nodes.push(node);
                    i = end_index;
                    continue;
                }
            }

            let mut paragraph_lines = vec![trimmed.to_string()];
            while i + 1 < lines.len()
                && !lines[i + 1].trim().is_empty()
                && !self.is_block_start(lines[i + 1])
            {
                i += 1;
                paragraph_lines.push(lines[i].trim().to_string());
            }
            nodes.push(ASTNode {
                node_type: NodeType::Paragraph,
                content: None,
                children: Some(self.parse_inline(&paragraph_lines.join(" "))),
                attrs: None,
                position: None,
            });
            i += 1;
        }

        if text.len() < 200 {
            self.cache.insert(cache_key, nodes.clone());
        }

        nodes
    }

    fn is_block_start(&self, line: &str) -> bool {
        let trimmed = line.trim();
        BLOCK_START_RE.is_match(trimmed)
    }

    fn parse_inline(&self, text: &str) -> Vec<ASTNode> {
        let mut nodes: Vec<ASTNode> = Vec::new();
        let mut remaining = text.to_string();

        while !remaining.is_empty() {
            let mut earliest: Option<(usize, usize, ASTNode)> = None;

            let candidates: [(&Regex, NodeType, usize); 4] = [
                (&STRONG_RE, NodeType::Strong, 1),
                (&EMPHASIS_RE, NodeType::Emphasis, 1),
                (&CODE_RE, NodeType::Code, 1),
                (&STRIKETHROUGH_RE, NodeType::Strikethrough, 1),
            ];

            for (regex, node_type, group) in candidates {
                if let Some(captures) = regex.captures(&remaining) {
                    if let Some(matched) = captures.get(0) {
                        let index = matched.start();
                        let length = matched.end() - matched.start();
                        let content = captures
                            .get(group)
                            .map_or("", |m| m.as_str())
                            .to_string();
                        let node = ASTNode {
                            node_type,
                            content: Some(content),
                            children: None,
                            attrs: None,
                            position: None,
                        };
                        if earliest.as_ref().map_or(true, |current| index < current.0) {
                            earliest = Some((index, length, node));
                        }
                    }
                }
            }

            if let Some(captures) = LINK_RE.captures(&remaining) {
                if let Some(matched) = captures.get(0) {
                    let index = matched.start();
                    let length = matched.end() - matched.start();
                    let content = captures.get(1).map_or("", |m| m.as_str());
                    let href = captures.get(2).map_or("", |m| m.as_str());
                    let node = ASTNode {
                        node_type: NodeType::Link,
                        content: Some(content.to_string()),
                        children: None,
                        attrs: Some(json!({ "href": href })),
                        position: None,
                    };
                    if earliest.as_ref().map_or(true, |current| index < current.0) {
                        earliest = Some((index, length, node));
                    }
                }
            }

            if let Some((index, length, node)) = earliest {
                if index > 0 {
                    nodes.push(ASTNode {
                        node_type: NodeType::Text,
                        content: Some(remaining[..index].to_string()),
                        children: None,
                        attrs: None,
                        position: None,
                    });
                }
                nodes.push(node);
                remaining = remaining[index + length..].to_string();
            } else {
                if !remaining.is_empty() {
                    nodes.push(ASTNode {
                        node_type: NodeType::Text,
                        content: Some(remaining.clone()),
                        children: None,
                        attrs: None,
                        position: None,
                    });
                }
                break;
            }
        }

        if nodes.is_empty() {
            vec![ASTNode {
                node_type: NodeType::Text,
                content: Some(text.to_string()),
                children: None,
                attrs: None,
                position: None,
            }]
        } else {
            nodes
        }
    }

    fn parse_table(&self, lines: &[&str], start_index: usize) -> Option<(ASTNode, usize)> {
        let header_line = *lines.get(start_index)?;
        let separator_line = *lines.get(start_index + 1)?;

        if !TABLE_SEPARATOR_RE.is_match(separator_line.trim()) {
            return None;
        }

        let parse_row = |line: &str| ASTNode {
            node_type: NodeType::TableRow,
            content: None,
            children: Some(
                line.split('|')
                    .filter(|cell| !cell.trim().is_empty())
                    .map(|cell| ASTNode {
                        node_type: NodeType::TableCell,
                        content: None,
                        children: Some(self.parse_inline(cell.trim())),
                        attrs: None,
                        position: None,
                    })
                    .collect(),
            ),
            attrs: None,
            position: None,
        };

        let mut rows = vec![parse_row(header_line)];
        let mut end_index = start_index + 2;

        while end_index < lines.len() && lines[end_index].contains('|') {
            rows.push(parse_row(lines[end_index]));
            end_index += 1;
        }

        Some((
            ASTNode {
                node_type: NodeType::Table,
                content: None,
                children: Some(rows),
                attrs: None,
                position: None,
            },
            end_index,
        ))
    }

    fn create_code_block_node(&self, content: String, language: String, streaming: bool) -> ASTNode {
        ASTNode {
            node_type: NodeType::CodeBlock,
            content: Some(content),
            children: None,
            attrs: Some(json!({ "language": language, "streaming": streaming })),
            position: None,
        }
    }
}

#[napi(js_name = "StreamingMarkdownParser")]
pub struct StreamingMarkdownParserBinding {
    parser: StreamingMarkdownParserCore,
}

#[napi]
impl StreamingMarkdownParserBinding {
    #[napi(constructor)]
    pub fn new(options: Option<Value>) -> Self {
        let parsed = options
            .and_then(|value| serde_json::from_value::<ParserOptions>(value).ok())
            .unwrap_or_default();
        let resolved = ParserOptionsResolved::from_options(Some(parsed));
        Self {
            parser: StreamingMarkdownParserCore::new(resolved),
        }
    }

    #[napi]
    pub fn push(&mut self, chunk: String) -> NapiResult<Value> {
        let result = self.parser.push(&chunk);
        serde_json::to_value(result).map_err(to_napi_error)
    }

    #[napi]
    pub fn flush(&mut self) -> NapiResult<Value> {
        let result = self.parser.flush();
        serde_json::to_value(result).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset(&mut self) {
        self.parser.reset();
    }

    #[napi(js_name = "getCacheStats")]
    pub fn get_cache_stats(&self) -> NapiResult<Value> {
        let stats = self.parser.get_cache_stats();
        serde_json::to_value(stats).map_err(to_napi_error)
    }
}

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}
