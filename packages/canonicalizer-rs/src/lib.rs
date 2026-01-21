use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CanonMark {
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    Link,
}

impl CanonMark {
    fn as_str(&self) -> &'static str {
        match self {
            CanonMark::Bold => "bold",
            CanonMark::Italic => "italic",
            CanonMark::Underline => "underline",
            CanonMark::Strike => "strike",
            CanonMark::Code => "code",
            CanonMark::Link => "link",
        }
    }
}

impl fmt::Display for CanonMark {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum CanonInputNode {
    Text { text: String },
    Element {
        tag: String,
        attrs: HashMap<String, String>,
        children: Vec<CanonInputNode>,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
enum CanonNode {
    Block(CanonBlock),
    Text(CanonText),
}

#[derive(Clone, Debug, Serialize)]
struct CanonBlock {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    attrs: BTreeMap<String, String>,
    children: Vec<CanonNode>,
}

#[derive(Clone, Debug, Serialize)]
struct CanonText {
    text: String,
    marks: Vec<CanonMark>,
    is_leaf: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    attrs: Option<CanonTextAttrs>,
}

#[derive(Clone, Debug, Serialize)]
struct CanonTextAttrs {
    href: String,
}

#[derive(Clone, Debug, Deserialize)]
struct CanonicalizeDocumentInput {
    root: CanonInputNode,
}

#[derive(Clone, Debug, Deserialize)]
struct CanonicalizerPolicyV2 {
    version: String,
    mode: String,
    mark_order: Vec<CanonMark>,
    normalize_whitespace: bool,
    drop_empty_nodes: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind")]
enum CanonDiag {
    #[serde(rename = "dropped_empty_node")]
    DroppedEmptyNode { path: String },
    #[serde(rename = "unknown_mark")]
    UnknownMark { tag: String, path: String },
    #[serde(rename = "unknown_block")]
    UnknownBlock { tag: String, path: String },
    #[serde(rename = "normalized_whitespace")]
    NormalizedWhitespace { path: String },
    #[serde(rename = "dropped_invalid_href")]
    DroppedInvalidHref { path: String, href: String },
    #[serde(rename = "dropped_non_link_href")]
    DroppedNonLinkHref { path: String, mark: String },
}

#[derive(Clone, Debug, Serialize)]
struct CanonicalizeResult {
    root: CanonNode,
    diagnostics: Vec<CanonDiag>,
}

#[derive(Clone, Debug, Default)]
struct ActiveAttrs {
    href: Option<String>,
}

#[derive(Clone, Debug)]
struct TextSegment {
    text: String,
    marks: HashSet<CanonMark>,
    attrs: ActiveAttrs,
}

#[napi(js_name = "canonicalizeDocument")]
pub fn canonicalize_document(input: Value, policy: Option<Value>) -> NapiResult<Value> {
    let input: CanonicalizeDocumentInput =
        serde_json::from_value(input).map_err(to_napi_error)?;
    let policy = match policy {
        Some(value) => serde_json::from_value(value).map_err(to_napi_error)?,
        None => default_policy(),
    };

    let result = canonicalize_document_internal(&input.root, &policy);
    serde_json::to_value(result).map_err(to_napi_error)
}

fn canonicalize_document_internal(
    root: &CanonInputNode,
    policy: &CanonicalizerPolicyV2,
) -> CanonicalizeResult {
    let mut diagnostics = Vec::new();
    let mut id_counter = 0usize;
    let root = canonicalize_node(root, "r", policy, &mut diagnostics, &mut id_counter)
        .unwrap_or_else(|| CanonNode::Block(empty_document_root()));

    CanonicalizeResult { root, diagnostics }
}

fn default_policy() -> CanonicalizerPolicyV2 {
    CanonicalizerPolicyV2 {
        version: "v2".to_string(),
        mode: "recursive_tree".to_string(),
        mark_order: vec![
            CanonMark::Bold,
            CanonMark::Italic,
            CanonMark::Underline,
            CanonMark::Strike,
            CanonMark::Code,
            CanonMark::Link,
        ],
        normalize_whitespace: true,
        drop_empty_nodes: true,
    }
}

fn empty_document_root() -> CanonBlock {
    CanonBlock {
        id: "r/0".to_string(),
        node_type: "document".to_string(),
        attrs: BTreeMap::new(),
        children: Vec::new(),
    }
}

fn canonicalize_node(
    node: &CanonInputNode,
    path: &str,
    policy: &CanonicalizerPolicyV2,
    diagnostics: &mut Vec<CanonDiag>,
    id_counter: &mut usize,
) -> Option<CanonNode> {
    match node {
        CanonInputNode::Text { text } => {
            let mut normalized = text.clone();
            if policy.normalize_whitespace {
                normalized = normalize_whitespace(&normalized);
            }

            if policy.drop_empty_nodes && is_empty_text(&normalized) {
                diagnostics.push(CanonDiag::DroppedEmptyNode {
                    path: path.to_string(),
                });
                return None;
            }

            Some(CanonNode::Text(CanonText {
                text: normalized,
                marks: Vec::new(),
                is_leaf: true,
                attrs: None,
            }))
        }
        CanonInputNode::Element {
            tag,
            attrs,
            children,
        } => {
            let tag_lower = tag.to_lowercase();
            if let Some(block_type) = default_map_tag_to_block_type(&tag_lower) {
                let id = format!("r/{}", *id_counter);
                *id_counter += 1;

                let mut canon_children: Vec<CanonNode> = Vec::new();
                let mut inline_nodes: Vec<&CanonInputNode> = Vec::new();
                let mut block_nodes: Vec<&CanonInputNode> = Vec::new();

                for child in children {
                    match child {
                        CanonInputNode::Text { .. } => inline_nodes.push(child),
                        CanonInputNode::Element { tag, .. } => {
                            let child_tag = tag.to_lowercase();
                            if is_block_tag(&child_tag) {
                                flush_inline_nodes(
                                    &mut inline_nodes,
                                    path,
                                    policy,
                                    diagnostics,
                                    &mut canon_children,
                                );
                                block_nodes.push(child);
                            } else {
                                inline_nodes.push(child);
                            }
                        }
                    }
                }

                flush_inline_nodes(
                    &mut inline_nodes,
                    path,
                    policy,
                    diagnostics,
                    &mut canon_children,
                );

                for (index, child) in block_nodes.iter().enumerate() {
                    let child_path = format!("{}/{}", path, index);
                    if let Some(canon_child) =
                        canonicalize_node(child, &child_path, policy, diagnostics, id_counter)
                    {
                        canon_children.push(canon_child);
                    }
                }

                if policy.drop_empty_nodes && canon_children.is_empty() {
                    diagnostics.push(CanonDiag::DroppedEmptyNode {
                        path: path.to_string(),
                    });
                    return None;
                }

                return Some(CanonNode::Block(CanonBlock {
                    id,
                    node_type: block_type.to_string(),
                    attrs: canonicalize_attrs(attrs),
                    children: canon_children,
                }));
            }

            if is_mark_tag(&tag_lower) {
                let segments = collect_inline_segments(
                    node,
                    path,
                    &HashSet::new(),
                    &ActiveAttrs::default(),
                    policy,
                    diagnostics,
                );
                let merged = merge_segments(&segments, policy);
                if merged.len() == 1 {
                    return Some(merged.into_iter().next().expect("segment"));
                }
                if !merged.is_empty() {
                    let id = format!("r/{}", *id_counter);
                    *id_counter += 1;
                    return Some(CanonNode::Block(CanonBlock {
                        id,
                        node_type: "paragraph".to_string(),
                        attrs: BTreeMap::new(),
                        children: merged,
                    }));
                }
                return None;
            }

            diagnostics.push(CanonDiag::UnknownBlock {
                tag: tag_lower.clone(),
                path: path.to_string(),
            });

            let mut canon_children = Vec::new();
            for (index, child) in children.iter().enumerate() {
                let child_path = format!("{}/{}", path, index);
                if let Some(canon_child) =
                    canonicalize_node(child, &child_path, policy, diagnostics, id_counter)
                {
                    canon_children.push(canon_child);
                }
            }

            if canon_children.is_empty() {
                return None;
            }

            let id = format!("r/{}", *id_counter);
            *id_counter += 1;

            Some(CanonNode::Block(CanonBlock {
                id,
                node_type: "unknown".to_string(),
                attrs: canonicalize_attrs(attrs),
                children: canon_children,
            }))
        }
    }
}

fn flush_inline_nodes(
    inline_nodes: &mut Vec<&CanonInputNode>,
    path: &str,
    policy: &CanonicalizerPolicyV2,
    diagnostics: &mut Vec<CanonDiag>,
    canon_children: &mut Vec<CanonNode>,
) {
    if inline_nodes.is_empty() {
        return;
    }

    let mut segments: Vec<TextSegment> = Vec::new();
    for (index, node) in inline_nodes.iter().enumerate() {
        let child_path = format!("{}/inline/{}", path, index);
        let mut collected = collect_inline_segments(
            node,
            &child_path,
            &HashSet::new(),
            &ActiveAttrs::default(),
            policy,
            diagnostics,
        );
        segments.append(&mut collected);
    }

    let merged = merge_segments(&segments, policy);
    canon_children.extend(merged);
    inline_nodes.clear();
}

fn collect_inline_segments(
    node: &CanonInputNode,
    path: &str,
    active_marks: &HashSet<CanonMark>,
    active_attrs: &ActiveAttrs,
    policy: &CanonicalizerPolicyV2,
    diagnostics: &mut Vec<CanonDiag>,
) -> Vec<TextSegment> {
    match node {
        CanonInputNode::Text { text } => {
            let mut normalized = text.clone();
            if policy.normalize_whitespace {
                let normalized_ws = normalize_whitespace(&normalized);
                if was_whitespace_normalized(&normalized, &normalized_ws) {
                    diagnostics.push(CanonDiag::NormalizedWhitespace {
                        path: path.to_string(),
                    });
                }
                normalized = normalized_ws;
            }
            if policy.drop_empty_nodes && is_empty_text(&normalized) {
                return Vec::new();
            }
            vec![TextSegment {
                text: normalized,
                marks: active_marks.clone(),
                attrs: active_attrs.clone(),
            }]
        }
        CanonInputNode::Element {
            tag,
            attrs,
            children,
        } => {
            let tag_lower = tag.to_lowercase();
            if let Some(mark) = tag_to_mark(&tag_lower) {
                let mut marks = active_marks.clone();
                marks.insert(mark.clone());

                let mut attrs_state = ActiveAttrs::default();
                let processed_href = process_mark_attributes(&mark, attrs);

                if let Some(href) = processed_href {
                    attrs_state.href = Some(href);
                } else if let Some(raw_href) = attrs.get("href") {
                    if !raw_href.is_empty() {
                        if mark == CanonMark::Link {
                            diagnostics.push(CanonDiag::DroppedInvalidHref {
                                path: path.to_string(),
                                href: raw_href.clone(),
                            });
                        } else {
                            diagnostics.push(CanonDiag::DroppedNonLinkHref {
                                path: path.to_string(),
                                mark: mark.to_string(),
                            });
                        }
                    }
                }

                let mut segments = Vec::new();
                for (index, child) in children.iter().enumerate() {
                    let child_path = format!("{}/{}", path, index);
                    segments.extend(collect_inline_segments(
                        child,
                        &child_path,
                        &marks,
                        &attrs_state,
                        policy,
                        diagnostics,
                    ));
                }
                return segments;
            }

            if !is_block_tag(&tag_lower) {
                diagnostics.push(CanonDiag::UnknownMark {
                    tag: tag_lower,
                    path: path.to_string(),
                });
                let mut segments = Vec::new();
                for (index, child) in children.iter().enumerate() {
                    let child_path = format!("{}/{}", path, index);
                    segments.extend(collect_inline_segments(
                        child,
                        &child_path,
                        active_marks,
                        active_attrs,
                        policy,
                        diagnostics,
                    ));
                }
                return segments;
            }

            Vec::new()
        }
    }
}

fn merge_segments(segments: &[TextSegment], policy: &CanonicalizerPolicyV2) -> Vec<CanonNode> {
    if segments.is_empty() {
        return Vec::new();
    }

    let mut result: Vec<CanonNode> = Vec::new();
    let mut current = segments[0].clone();

    for segment in segments.iter().skip(1) {
        if current.marks == segment.marks && current.attrs.href == segment.attrs.href {
            current.text.push_str(&segment.text);
        } else {
            result.push(CanonNode::Text(segment_to_canon_text(&current, policy)));
            current = segment.clone();
        }
    }

    result.push(CanonNode::Text(segment_to_canon_text(&current, policy)));
    result
}

fn segment_to_canon_text(segment: &TextSegment, policy: &CanonicalizerPolicyV2) -> CanonText {
    let marks = sort_marks(&segment.marks, policy);
    let attrs = segment
        .attrs
        .href
        .as_ref()
        .map(|href| CanonTextAttrs { href: href.clone() });

    CanonText {
        text: segment.text.clone(),
        marks,
        is_leaf: true,
        attrs,
    }
}

fn default_map_tag_to_block_type(tag: &str) -> Option<&'static str> {
    match tag {
        "p" | "div" => Some("paragraph"),
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => Some("heading"),
        "ul" | "ol" => Some("list"),
        "li" => Some("list_item"),
        "table" => Some("table"),
        "tr" => Some("table_row"),
        "td" | "th" => Some("table_cell"),
        "blockquote" => Some("quote"),
        "pre" => Some("code_block"),
        _ => None,
    }
}

fn is_block_tag(tag: &str) -> bool {
    default_map_tag_to_block_type(tag).is_some()
}

fn canonicalize_attrs(attrs: &HashMap<String, String>) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    for (key, value) in attrs {
        result.insert(key.clone(), value.clone());
    }
    result
}

fn tag_to_mark(tag: &str) -> Option<CanonMark> {
    match tag {
        "b" | "strong" => Some(CanonMark::Bold),
        "i" | "em" => Some(CanonMark::Italic),
        "u" => Some(CanonMark::Underline),
        "s" | "del" | "strike" => Some(CanonMark::Strike),
        "code" => Some(CanonMark::Code),
        "a" => Some(CanonMark::Link),
        _ => None,
    }
}

fn is_mark_tag(tag: &str) -> bool {
    tag_to_mark(tag).is_some()
}

fn sort_marks(marks: &HashSet<CanonMark>, policy: &CanonicalizerPolicyV2) -> Vec<CanonMark> {
    let mut mark_vec: Vec<CanonMark> = marks.iter().cloned().collect();
    let mut order_map: HashMap<CanonMark, usize> = HashMap::new();
    for (index, mark) in policy.mark_order.iter().enumerate() {
        order_map.insert(mark.clone(), index);
    }

    mark_vec.sort_by(|a, b| {
        let order_a = *order_map.get(a).unwrap_or(&usize::MAX);
        let order_b = *order_map.get(b).unwrap_or(&usize::MAX);
        if order_a == order_b {
            a.as_str().cmp(b.as_str())
        } else {
            order_a.cmp(&order_b)
        }
    });

    mark_vec
}

fn process_mark_attributes(mark: &CanonMark, attrs: &HashMap<String, String>) -> Option<String> {
    if *mark != CanonMark::Link {
        return None;
    }

    validate_and_sanitize_href(attrs.get("href"))
}

fn validate_and_sanitize_href(href: Option<&String>) -> Option<String> {
    let href = href?;
    let trimmed = href.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_valid_url(trimmed) {
        return Some(trimmed.to_string());
    }
    None
}

fn is_valid_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
}

fn normalize_lf(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\r' {
            if let Some('\n') = chars.peek() {
                chars.next();
            }
            result.push('\n');
        } else {
            result.push(ch);
        }
    }

    result
}

fn normalize_whitespace(text: &str) -> String {
    let normalized = normalize_lf(text);
    let mut result = String::with_capacity(normalized.len());
    let mut in_space = false;

    for ch in normalized.chars() {
        if ch == ' ' || ch == '\t' {
            if !in_space {
                result.push(' ');
                in_space = true;
            }
        } else {
            in_space = false;
            result.push(ch);
        }
    }

    result
}

fn is_empty_text(text: &str) -> bool {
    text.trim().is_empty()
}

fn was_whitespace_normalized(original: &str, normalized: &str) -> bool {
    original != normalized
}

fn to_napi_error(error: impl fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}
