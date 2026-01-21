use std::collections::BTreeMap;

use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{Map, Value};

const DEFAULT_MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const DEFAULT_MAX_NESTING_DEPTH: usize = 100;
const DEFAULT_MAX_ATTRIBUTE_COUNT: usize = 1000;
const CRITICAL_PROTOCOLS: [&str; 2] = ["vbscript:", "data:"];
const BLOCKED_TAGS: [&str; 5] = ["script", "style", "iframe", "object", "embed"];
const SELF_CLOSING_TAGS: [&str; 6] = ["br", "hr", "img", "input", "meta", "link"];

#[napi(object)]
pub struct SanitizerInput {
  pub html: Option<String>,
  pub markdown: Option<String>,
}

#[napi(object)]
pub struct SanitizationLimits {
  pub max_payload_bytes: Option<u32>,
  pub max_nesting_depth: Option<u32>,
  pub max_attribute_count: Option<u32>,
}

#[napi(object)]
pub struct SanitizationPolicy {
  pub allowed_url_protocols: Option<Vec<String>>,
  pub max_payload_size: Option<u32>,
  pub limits: Option<SanitizationLimits>,
}

#[napi(object)]
pub struct SanitizationDiagnostic {
  pub kind: String,
  pub detail: String,
  pub severity: Option<String>,
}

#[napi(object)]
pub struct SanitizationError {
  pub kind: String,
  pub detail: String,
}

#[napi(object)]
pub struct SanitizedPayload {
  pub sanitized_html: Option<String>,
  pub sanitized_markdown: Option<String>,
  pub diagnostics: Vec<SanitizationDiagnostic>,
  pub errors: Option<Vec<SanitizationError>>,
}

struct Limits {
  max_payload_bytes: usize,
  max_nesting_depth: usize,
  max_attribute_count: usize,
}

struct TagState {
  current_depth: usize,
  max_depth: usize,
  max_attrs: usize,
}

struct AttributeMatch {
  raw_name: String,
  name: String,
  value: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum UrlSafety {
  Safe,
  Unsafe,
  Critical,
}

type SanitizationErrors = Vec<SanitizationError>;

type SanitizationDiagnostics = Vec<SanitizationDiagnostic>;

struct SanitizeResult {
  result: String,
  errors: SanitizationErrors,
}

static TAG_REGEX: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"<(\/?)([a-zA-Z][\w:-]*)(\s+(?:[^\"'>]+|\"[^\"]*\"|'[^']*')*)?>"#)
    .expect("invalid tag regex")
});

static ATTR_REGEX: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"([a-zA-Z_][\w:-]*)\s*=\s*[\"']([^\"']*)[\"']"#)
    .expect("invalid attr regex")
});

static PARSE_TAG_REGEX: Lazy<Regex> =
  Lazy::new(|| Regex::new(r#"<(\/?)([\w-]+)([^>]*)>"#).expect("invalid parse tag regex"));

static PARSE_ATTR_REGEX: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"([\w-]+)\s*=\s*[\"']([^\"']*)[\"']"#).expect("invalid parse attr regex")
});

static BLOCKED_REGEXES: Lazy<Vec<(String, Regex)>> = Lazy::new(|| {
  BLOCKED_TAGS
    .iter()
    .map(|tag| {
      let pattern = format!(r"(?is)<\s*{tag}\b[^>]*>.*?<\s*/\s*{tag}\s*>");
      (
        (*tag).to_string(),
        Regex::new(&pattern).expect("invalid blocked tag regex"),
      )
    })
    .collect()
});

fn utf16_len(value: &str) -> usize {
  value.encode_utf16().count()
}

fn resolve_limits(policy: &SanitizationPolicy) -> Limits {
  let fallback_bytes = policy
    .max_payload_size
    .map(|value| value as usize)
    .unwrap_or(DEFAULT_MAX_PAYLOAD_BYTES);
  let limits = policy.limits.as_ref();

  let max_payload_bytes = limits
    .and_then(|value| value.max_payload_bytes)
    .map(|value| value as usize)
    .unwrap_or(fallback_bytes);
  let max_nesting_depth = limits
    .and_then(|value| value.max_nesting_depth)
    .map(|value| value as usize)
    .unwrap_or(DEFAULT_MAX_NESTING_DEPTH);
  let max_attribute_count = limits
    .and_then(|value| value.max_attribute_count)
    .map(|value| value as usize)
    .unwrap_or(DEFAULT_MAX_ATTRIBUTE_COUNT);

  Limits {
    max_payload_bytes,
    max_nesting_depth,
    max_attribute_count,
  }
}

fn normalize_url(value: &str) -> String {
  let lowered = value.trim().to_lowercase();
  let mut result = String::new();

  for ch in lowered.chars() {
    let code = ch as u32;
    if code <= 0x1f || code == 0x7f {
      continue;
    }
    if ch.is_whitespace() {
      continue;
    }
    result.push(ch);
  }

  result
}

fn normalize_protocols(protocols: &[String]) -> Vec<String> {
  protocols
    .iter()
    .map(|proto| proto.trim().to_lowercase())
    .collect()
}

fn classify_url(url: &str, allowed_protocols: Option<&Vec<String>>) -> UrlSafety {
  let normalized = normalize_url(url);

  for proto in CRITICAL_PROTOCOLS {
    if normalized.starts_with(proto) {
      return UrlSafety::Critical;
    }
  }

  let allowed = allowed_protocols
    .map(|protocols| normalize_protocols(protocols))
    .unwrap_or_else(|| vec!["https:".to_string(), "http:".to_string(), "mailto:".to_string()]);
  for proto in allowed {
    if normalized.starts_with(&proto) {
      return UrlSafety::Safe;
    }
  }

  if normalized.starts_with('/') || normalized.starts_with('#') || !normalized.contains(':') {
    return UrlSafety::Safe;
  }

  UrlSafety::Unsafe
}

fn parse_srcset_urls(value: &str) -> Vec<String> {
  value
    .split(',')
    .filter_map(|entry| {
      let trimmed = entry.trim();
      if trimmed.is_empty() {
        return None;
      }
      trimmed.split_whitespace().next().map(|value| value.to_string())
    })
    .collect()
}

struct UrlSafetySummary {
  status: UrlSafety,
  unsafe_urls: Vec<String>,
  critical_urls: Vec<String>,
}

fn summarize_url_safety(name: &str, value: &str, policy: &SanitizationPolicy) -> UrlSafetySummary {
  let urls = if name == "srcset" {
    parse_srcset_urls(value)
  } else {
    vec![value.to_string()]
  };

  let mut unsafe_urls = Vec::new();
  let mut critical_urls = Vec::new();

  for url in urls {
    match classify_url(&url, policy.allowed_url_protocols.as_ref()) {
      UrlSafety::Critical => critical_urls.push(url),
      UrlSafety::Unsafe => unsafe_urls.push(url),
      UrlSafety::Safe => {}
    }
  }

  let status = if !critical_urls.is_empty() {
    UrlSafety::Critical
  } else if !unsafe_urls.is_empty() {
    UrlSafety::Unsafe
  } else {
    UrlSafety::Safe
  };

  UrlSafetySummary {
    status,
    unsafe_urls,
    critical_urls,
  }
}

fn push_diag(
  diagnostics: &mut SanitizationDiagnostics,
  kind: &str,
  detail: String,
  severity: Option<&str>,
) {
  diagnostics.push(SanitizationDiagnostic {
    kind: kind.to_string(),
    detail,
    severity: severity.map(|value| value.to_string()),
  });
}

fn push_error(errors: &mut SanitizationErrors, kind: &str, detail: String) {
  errors.push(SanitizationError {
    kind: kind.to_string(),
    detail,
  });
}

fn record_url_findings(
  name: &str,
  summary: UrlSafetySummary,
  diagnostics: &mut SanitizationDiagnostics,
  errors: &mut SanitizationErrors,
) {
  for url in summary.critical_urls {
    push_error(
      errors,
      "critical_security_violation",
      format!("Critical URL in {name}: {url}"),
    );
  }

  if !summary.unsafe_urls.is_empty() {
    push_diag(
      diagnostics,
      "sanitized_url",
      format!("Sanitized unsafe URL in {name}"),
      Some("warning"),
    );
  }
}

fn is_allowed_tag(tag: &str) -> bool {
  matches!(
    tag,
    "span"
      | "b"
      | "strong"
      | "i"
      | "em"
      | "u"
      | "s"
      | "code"
      | "a"
      | "p"
      | "blockquote"
      | "ul"
      | "ol"
      | "li"
      | "pre"
      | "h1"
      | "h2"
      | "h3"
      | "h4"
      | "h5"
      | "h6"
      | "br"
      | "table"
      | "thead"
      | "tbody"
      | "tr"
      | "th"
      | "td"
  )
}

fn is_void_tag(tag: &str) -> bool {
  matches!(
    tag,
    "br" | "hr" | "img" | "input" | "col" | "source" | "area" | "base" | "link" | "meta"
  )
}

fn is_url_attribute(name: &str) -> bool {
  matches!(name, "href" | "src" | "srcset" | "poster" | "xlink:href")
}

fn is_allowed_attribute(tag: &str, name: &str) -> bool {
  match tag {
    "a" => matches!(name, "href" | "title" | "rel" | "target"),
    "td" | "th" => matches!(name, "colspan" | "rowspan"),
    _ => false,
  }
}

fn collect_attribute_matches(attrs: &str) -> Vec<AttributeMatch> {
  ATTR_REGEX
    .captures_iter(attrs)
    .filter_map(|caps| {
      let raw_name = caps.get(1)?.as_str();
      let value = caps.get(2)?.as_str();
      Some(AttributeMatch {
        raw_name: raw_name.to_string(),
        name: raw_name.to_lowercase(),
        value: value.to_string(),
      })
    })
    .collect()
}

fn scan_url_attributes(
  matches: &[AttributeMatch],
  policy: &SanitizationPolicy,
  diagnostics: &mut SanitizationDiagnostics,
  errors: &mut SanitizationErrors,
) {
  for item in matches {
    if !is_url_attribute(&item.name) {
      continue;
    }

    let summary = summarize_url_safety(&item.name, &item.value, policy);
    if summary.status != UrlSafety::Safe {
      record_url_findings(&item.name, summary, diagnostics, errors);
    }
  }
}

fn sanitize_attribute(
  item: &AttributeMatch,
  policy: &SanitizationPolicy,
  diagnostics: &mut SanitizationDiagnostics,
  errors: &mut SanitizationErrors,
  allowed: bool,
) -> Option<String> {
  if item.name.starts_with("on") {
    push_diag(
      diagnostics,
      "removed_attr",
      format!("Removed event handler attribute: {}", item.name),
      Some("warning"),
    );
    return None;
  }

  if item.name == "style" {
    push_diag(
      diagnostics,
      "removed_attr",
      "Removed style attribute".to_string(),
      Some("warning"),
    );
    return None;
  }

  if is_url_attribute(&item.name) {
    let summary = summarize_url_safety(&item.name, &item.value, policy);
    if summary.status != UrlSafety::Safe {
      record_url_findings(&item.name, summary, diagnostics, errors);
      return None;
    }
  }

  if !allowed {
    push_diag(
      diagnostics,
      "removed_attr",
      format!("Removed non-whitelisted attribute: {}", item.name),
      Some("warning"),
    );
    return None;
  }

  Some(format!("{}=\"{}\"", item.raw_name, item.value))
}

fn filter_attributes_for_tag(
  tag: &str,
  matches: &[AttributeMatch],
  policy: &SanitizationPolicy,
  diagnostics: &mut SanitizationDiagnostics,
  errors: &mut SanitizationErrors,
  max_attrs: usize,
) -> String {
  if matches.is_empty() {
    return String::new();
  }

  let limit = usize::min(matches.len(), max_attrs);
  let mut filtered = Vec::new();

  for item in matches.iter().take(limit) {
    let allowed = is_allowed_attribute(tag, &item.name);
    if let Some(attr) = sanitize_attribute(item, policy, diagnostics, errors, allowed) {
      filtered.push(attr);
    }
  }

  if filtered.is_empty() {
    String::new()
  } else {
    format!(" {}", filtered.join(" "))
  }
}

fn update_depth(
  state: &mut TagState,
  tag: &str,
  is_closing: bool,
  is_self_closing: bool,
  errors: &mut SanitizationErrors,
) {
  let is_void = is_void_tag(tag);
  if !is_closing {
    if !is_self_closing && !is_void {
      state.current_depth += 1;
      if state.current_depth > state.max_depth {
        push_error(
          errors,
          "limit_exceeded",
          format!(
            "Nesting depth exceeded: {} > {}",
            state.current_depth, state.max_depth
          ),
        );
      }
    }
    return;
  }

  if !is_void {
    state.current_depth = state.current_depth.saturating_sub(1);
  }
}

fn sanitize_tag_match(
  closing: &str,
  tag_name: &str,
  attrs: &str,
  policy: &SanitizationPolicy,
  diagnostics: &mut SanitizationDiagnostics,
  errors: &mut SanitizationErrors,
  state: &mut TagState,
) -> String {
  let lower_tag = tag_name.to_lowercase();
  let is_closing = closing == "/";
  let trimmed_attrs = attrs.trim();
  let is_self_closing = trimmed_attrs.ends_with('/');

  update_depth(state, &lower_tag, is_closing, is_self_closing, errors);

  if is_closing {
    return if is_allowed_tag(&lower_tag) {
      format!("</{}>", tag_name)
    } else {
      String::new()
    };
  }

  let matches = if attrs.is_empty() {
    Vec::new()
  } else {
    collect_attribute_matches(attrs)
  };

  if matches.len() > state.max_attrs {
    push_error(
      errors,
      "limit_exceeded",
      format!(
        "Attribute count exceeded for <{}>: {} > {}",
        tag_name,
        matches.len(),
        state.max_attrs
      ),
    );
  }

  if !is_allowed_tag(&lower_tag) {
    if !matches.is_empty() {
      scan_url_attributes(&matches, policy, diagnostics, errors);
    }
    push_diag(
      diagnostics,
      "removed_tag",
      format!("Removed non-whitelisted tag: <{}>", tag_name),
      Some("warning"),
    );
    return String::new();
  }

  let filtered_attrs = if matches.is_empty() {
    String::new()
  } else {
    filter_attributes_for_tag(&lower_tag, &matches, policy, diagnostics, errors, state.max_attrs)
  };

  format!("<{}{}>", tag_name, filtered_attrs)
}

fn strip_blocked_elements(
  html: &str,
  diagnostics: &mut SanitizationDiagnostics,
) -> String {
  let mut result = html.to_string();

  for (tag, regex) in BLOCKED_REGEXES.iter() {
    result = regex
      .replace_all(&result, |_caps: &regex::Captures| {
        push_diag(
          diagnostics,
          "removed_tag",
          format!("Removed blocked tag: <{}>", tag),
          Some("warning"),
        );
        ""
      })
      .to_string();
  }

  result
}

fn sanitize_html_string(
  html: &str,
  policy: &SanitizationPolicy,
  diagnostics: &mut SanitizationDiagnostics,
) -> SanitizeResult {
  let limits = resolve_limits(policy);
  let mut errors = Vec::new();

  let stripped = strip_blocked_elements(html, diagnostics);
  let mut output = String::with_capacity(stripped.len());
  let mut state = TagState {
    current_depth: 0,
    max_depth: limits.max_nesting_depth,
    max_attrs: limits.max_attribute_count,
  };

  let mut last_index = 0;
  for captures in TAG_REGEX.captures_iter(&stripped) {
    let mat = match captures.get(0) {
      Some(value) => value,
      None => continue,
    };

    output.push_str(&stripped[last_index..mat.start()]);

    let closing = captures.get(1).map(|value| value.as_str()).unwrap_or("");
    let tag_name = captures.get(2).map(|value| value.as_str()).unwrap_or("");
    let attrs = captures.get(3).map(|value| value.as_str()).unwrap_or("");

    let sanitized = sanitize_tag_match(
      closing,
      tag_name,
      attrs,
      policy,
      diagnostics,
      &mut errors,
      &mut state,
    );
    output.push_str(&sanitized);

    last_index = mat.end();
  }

  output.push_str(&stripped[last_index..]);

  SanitizeResult { result: output, errors }
}

fn sanitize_markdown(markdown: &str, diagnostics: &mut SanitizationDiagnostics) -> String {
  static HTML_IN_MD: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<[^>]+>").expect("invalid markdown regex"));

  if HTML_IN_MD.is_match(markdown) {
    push_diag(
      diagnostics,
      "removed_html_in_md",
      "Removed HTML tags from markdown".to_string(),
      None,
    );
    return HTML_IN_MD.replace_all(markdown, "").to_string();
  }

  markdown.to_string()
}

#[napi]
pub fn sanitize(input: SanitizerInput, policy: SanitizationPolicy) -> SanitizedPayload {
  let mut diagnostics = Vec::new();
  let limits = resolve_limits(&policy);

  let total_size = input
    .html
    .as_ref()
    .map(|value| utf16_len(value))
    .unwrap_or(0)
    + input
      .markdown
      .as_ref()
      .map(|value| utf16_len(value))
      .unwrap_or(0);

  if total_size > limits.max_payload_bytes {
    push_diag(
      &mut diagnostics,
      "payload_too_large",
      format!("Payload size {} exceeds limit {}", total_size, limits.max_payload_bytes),
      None,
    );
    return SanitizedPayload {
      sanitized_html: None,
      sanitized_markdown: None,
      diagnostics,
      errors: Some(vec![SanitizationError {
        kind: "payload_too_large".to_string(),
        detail: "Payload too large".to_string(),
      }]),
    };
  }

  let mut errors = Vec::new();
  let mut sanitized_html = None;
  let mut sanitized_markdown = None;

  if let Some(html) = input.html {
    if !html.is_empty() {
      let sanitized = sanitize_html_string(&html, &policy, &mut diagnostics);
      sanitized_html = Some(sanitized.result);
      if !sanitized.errors.is_empty() {
        errors = sanitized.errors;
      }
    }
  }

  if let Some(markdown) = input.markdown {
    if !markdown.is_empty() {
      sanitized_markdown = Some(sanitize_markdown(&markdown, &mut diagnostics));
    }
  }

  let errors = if errors.is_empty() { None } else { Some(errors) };

  SanitizedPayload {
    sanitized_html,
    sanitized_markdown,
    diagnostics,
    errors,
  }
}

#[derive(Debug)]
struct Node {
  kind: NodeKind,
}

#[derive(Debug)]
enum NodeKind {
  Text(String),
  Element {
    tag: String,
    attrs: BTreeMap<String, String>,
    children: Vec<usize>,
  },
}

fn parse_attrs(attrs: &str) -> BTreeMap<String, String> {
  let mut result = BTreeMap::new();

  for caps in PARSE_ATTR_REGEX.captures_iter(attrs) {
    let Some(name) = caps.get(1) else { continue };
    let Some(value) = caps.get(2) else { continue };
    result.insert(name.as_str().to_lowercase(), value.as_str().to_string());
  }

  result
}

fn is_self_closing_tag(tag: &str) -> bool {
  SELF_CLOSING_TAGS.iter().any(|value| value == &tag)
}

fn add_text_node(arena: &mut Vec<Node>, stack: &mut Vec<usize>, text: &str) {
  if stack.is_empty() {
    return;
  }

  let node_index = arena.len();
  arena.push(Node {
    kind: NodeKind::Text(text.to_string()),
  });

  if let Some(parent_index) = stack.last().copied() {
    if let NodeKind::Element { children, .. } = &mut arena[parent_index].kind {
      children.push(node_index);
    }
  }
}

fn add_element_node(
  arena: &mut Vec<Node>,
  stack: &mut Vec<usize>,
  tag: String,
  attrs: BTreeMap<String, String>,
) {
  if stack.is_empty() {
    return;
  }

  let node_index = arena.len();
  arena.push(Node {
    kind: NodeKind::Element {
      tag: tag.clone(),
      attrs,
      children: Vec::new(),
    },
  });

  let Some(parent_index) = stack.last().copied() else {
    return;
  };

  if let NodeKind::Element { children, .. } = &mut arena[parent_index].kind {
    children.push(node_index);
  }

  if !is_self_closing_tag(&tag) {
    stack.push(node_index);
  }
}

fn handle_close_tag(arena: &mut [Node], stack: &mut Vec<usize>, tag: &str) {
  while stack.len() > 1 {
    let Some(top_index) = stack.last().copied() else {
      return;
    };
    let matches = match &arena[top_index].kind {
      NodeKind::Element { tag: open_tag, .. } => open_tag == tag,
      NodeKind::Text(_) => false,
    };

    if matches {
      break;
    }

    stack.pop();
  }

  if stack.len() > 1 {
    stack.pop();
  }
}

fn node_to_value(node_index: usize, arena: &[Node]) -> Value {
  match &arena[node_index].kind {
    NodeKind::Text(text) => {
      let mut map = Map::new();
      map.insert("kind".to_string(), Value::String("text".to_string()));
      map.insert("text".to_string(), Value::String(text.clone()));
      Value::Object(map)
    }
    NodeKind::Element { tag, attrs, children } => {
      let mut map = Map::new();
      map.insert("kind".to_string(), Value::String("element".to_string()));
      map.insert("tag".to_string(), Value::String(tag.clone()));

      let mut attrs_map = Map::new();
      for (key, value) in attrs.iter() {
        attrs_map.insert(key.clone(), Value::String(value.clone()));
      }
      map.insert("attrs".to_string(), Value::Object(attrs_map));

      let mut children_values = Vec::with_capacity(children.len());
      for child_index in children {
        children_values.push(node_to_value(*child_index, arena));
      }
      map.insert("children".to_string(), Value::Array(children_values));

      Value::Object(map)
    }
  }
}

#[napi(js_name = "parseHtmlToInputTree")]
pub fn parse_html_to_input_tree(html: String) -> Value {
  let mut arena: Vec<Node> = Vec::new();
  let root_index = arena.len();
  arena.push(Node {
    kind: NodeKind::Element {
      tag: "div".to_string(),
      attrs: BTreeMap::new(),
      children: Vec::new(),
    },
  });

  let mut stack: Vec<usize> = vec![root_index];
  let mut last_index = 0;

  for captures in PARSE_TAG_REGEX.captures_iter(&html) {
    let mat = match captures.get(0) {
      Some(value) => value,
      None => continue,
    };

    if mat.start() > last_index {
      let text = &html[last_index..mat.start()];
      if !text.trim().is_empty() {
        add_text_node(&mut arena, &mut stack, text);
      }
    }

    let is_close = captures.get(1).map(|value| value.as_str()) == Some("/");
    let tag = captures
      .get(2)
      .map(|value| value.as_str().to_lowercase())
      .unwrap_or_default();
    let attrs = captures.get(3).map(|value| value.as_str()).unwrap_or("");

    if is_close {
      handle_close_tag(&mut arena, &mut stack, &tag);
    } else {
      let parsed_attrs = parse_attrs(attrs);
      add_element_node(&mut arena, &mut stack, tag, parsed_attrs);
    }

    last_index = mat.end();
  }

  if last_index < html.len() {
    let text = &html[last_index..];
    if !text.trim().is_empty() {
      add_text_node(&mut arena, &mut stack, text);
    }
  }

  node_to_value(root_index, &arena)
}
