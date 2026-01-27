use napi_derive::napi;
use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tiktoken_rs::{cl100k_base, get_bpe_from_model, CoreBPE};
use std::io::Cursor;
use zstd::bulk::compress as zstd_compress;
use zstd::stream::decode_all as zstd_decompress;

const TOKEN_APPROX_CHARS: u32 = 4;
const TOOL_CALL_TOKEN_COST: u32 = 50;
const TRUNCATE_TOKEN_FLOOR: u32 = 50;
const DEFAULT_MODEL: &str = "cl100k_base";

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ToolCall {
  pub id: String,
  pub name: String,
  pub arguments: Value,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ToolResult {
  #[napi(js_name = "callId")]
  pub call_id: String,
  pub result: Value,
  pub size: Option<u32>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct Message {
  pub role: String,
  pub content: Option<String>,
  #[napi(js_name = "toolCalls")]
  pub tool_calls: Option<Vec<ToolCall>>,
  #[napi(js_name = "toolResults")]
  pub tool_results: Option<Vec<ToolResult>>,
  #[napi(js_name = "toolName")]
  pub tool_name: Option<String>,
  pub result: Option<Value>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct CompressedContext {
  pub messages: Vec<Message>,
  #[napi(js_name = "totalTokens")]
  pub total_tokens: u32,
  #[napi(js_name = "removedCount")]
  pub removed_count: u32,
  #[napi(js_name = "compressionRatio")]
  pub compression_ratio: f64,
  #[napi(js_name = "selectedIndices")]
  pub selected_indices: Vec<u32>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct CompressedPayload {
  pub data: Vec<u8>,
  #[napi(js_name = "originalBytes")]
  pub original_bytes: u32,
  #[napi(js_name = "compressedBytes")]
  pub compressed_bytes: u32,
  #[napi(js_name = "compressionRatio")]
  pub compression_ratio: f64,
  pub encoding: String,
}

static BPE_CACHE: Lazy<Mutex<HashMap<String, CoreBPE>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[napi]
pub fn count_tokens(text: String, model: String) -> u32 {
  if text.is_empty() {
    return 0;
  }
  count_tokens_internal(&text, &model)
}

#[napi]
pub fn count_tokens_batch(texts: Vec<String>, model: String) -> Vec<u32> {
  if texts.is_empty() {
    return Vec::new();
  }

  let bpe = resolve_bpe(&model);
  match bpe {
    Some(bpe) => texts
      .into_iter()
      .map(|text| bpe.encode_with_special_tokens(&text).len() as u32)
      .collect(),
    None => texts
      .into_iter()
      .map(|text| approximate_tokens(&text))
      .collect(),
  }
}

#[napi]
pub fn estimate_json_tokens(value: Value, model: String) -> u32 {
  estimate_json_tokens_internal(&value, &model)
}

#[napi]
pub fn compress_context(
  messages: Vec<Message>,
  max_tokens: u32,
  preserve_last_n: u32,
  model: Option<String>,
) -> CompressedContext {
  if messages.is_empty() {
    return CompressedContext {
      messages,
      total_tokens: 0,
      removed_count: 0,
      compression_ratio: 0.0,
      selected_indices: Vec::new(),
    };
  }

  let model = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
  let total_count = messages.len();
  let preserve_last_n = preserve_last_n as usize;
  let preserved_start = total_count.saturating_sub(preserve_last_n);

  let preserved = messages[preserved_start..].to_vec();
  let preserved_tokens = total_tokens_for_messages(&preserved, &model);
  let available_tokens = max_tokens.saturating_sub(preserved_tokens);

  let mut truncated_rev: Vec<Message> = Vec::new();
  let mut selected_indices_rev: Vec<usize> = Vec::new();
  let mut used_tokens = 0;

  for (index, msg) in messages[..preserved_start].iter().enumerate().rev() {
    let msg_tokens = estimate_message_tokens(msg, &model);
    if used_tokens + msg_tokens <= available_tokens {
      truncated_rev.push(msg.clone());
      selected_indices_rev.push(index);
      used_tokens += msg_tokens;
      continue;
    }

    let remaining = available_tokens.saturating_sub(used_tokens);
    if remaining > TRUNCATE_TOKEN_FLOOR {
      if let Some(content) = &msg.content {
        let truncated_content = truncate_text(content, remaining);
        if !truncated_content.is_empty() {
          let mut truncated_msg = msg.clone();
          truncated_msg.content = Some(truncated_content);
          let truncated_tokens = estimate_message_tokens(&truncated_msg, &model);
          if truncated_tokens > 0 {
            truncated_rev.push(truncated_msg);
            selected_indices_rev.push(index);
          }
        }
      }
    }
    break;
  }

  truncated_rev.reverse();
  selected_indices_rev.reverse();
  let mut result_messages = truncated_rev;
  result_messages.extend(preserved);

  let total_tokens = total_tokens_for_messages(&result_messages, &model);
  let removed_count = total_count.saturating_sub(result_messages.len()) as u32;
  let compression_ratio = if total_count == 0 {
    0.0
  } else {
    1.0 - (result_messages.len() as f64 / total_count as f64)
  };

  let mut selected_indices: Vec<u32> = selected_indices_rev
    .iter()
    .map(|index| *index as u32)
    .collect();
  selected_indices.extend(
    (preserved_start..total_count)
      .map(|index| index as u32),
  );

  CompressedContext {
    messages: result_messages,
    total_tokens,
    removed_count,
    compression_ratio,
    selected_indices,
  }
}

#[napi]
pub fn compress_payload_zstd(
  value: Value,
  min_bytes: u32,
  level: Option<i32>,
) -> Option<CompressedPayload> {
  let serialized = serde_json::to_vec(&value).ok()?;
  if min_bytes > 0 && serialized.len() < min_bytes as usize {
    return None;
  }

  let level = level.unwrap_or(3).clamp(1, 22);
  let compressed = zstd_compress(&serialized, level).ok()?;
  if compressed.len() >= serialized.len() {
    return None;
  }

  let original_bytes = serialized.len() as u32;
  let compressed_bytes = compressed.len() as u32;
  let compression_ratio = if original_bytes == 0 {
    0.0
  } else {
    compressed_bytes as f64 / original_bytes as f64
  };

  Some(CompressedPayload {
    data: compressed,
    original_bytes,
    compressed_bytes,
    compression_ratio,
    encoding: "zstd".to_string(),
  })
}

#[napi]
pub fn decompress_payload_zstd(data: Vec<u8>) -> Option<Vec<u8>> {
  let mut cursor = Cursor::new(data);
  let decompressed = zstd_decompress(&mut cursor).ok()?;
  Some(decompressed)
}

fn resolve_bpe(model: &str) -> Option<CoreBPE> {
  let mut cache = BPE_CACHE.lock().unwrap_or_else(|error| error.into_inner());
  if let Some(bpe) = cache.get(model) {
    return Some(bpe.clone());
  }

  let bpe = get_bpe_from_model(model).or_else(|_| cl100k_base()).ok()?;
  cache.insert(model.to_string(), bpe.clone());
  Some(bpe)
}

fn count_tokens_internal(text: &str, model: &str) -> u32 {
  match resolve_bpe(model) {
    Some(bpe) => bpe.encode_with_special_tokens(text).len() as u32,
    None => approximate_tokens(text),
  }
}

fn approximate_tokens(text: &str) -> u32 {
  let len = text.chars().count() as u32;
  if len == 0 {
    0
  } else {
    (len + TOKEN_APPROX_CHARS - 1) / TOKEN_APPROX_CHARS
  }
}

fn estimate_json_tokens_internal(value: &Value, model: &str) -> u32 {
  match serde_json::to_string(value) {
    Ok(text) => count_tokens_internal(&text, model),
    Err(_) => count_tokens_internal(&format!("{value:?}"), model),
  }
}

fn total_tokens_for_messages(messages: &[Message], model: &str) -> u32 {
  messages
    .iter()
    .map(|msg| estimate_message_tokens(msg, model))
    .sum()
}

fn estimate_message_tokens(message: &Message, model: &str) -> u32 {
  let mut tokens = 0;

  if let Some(content) = &message.content {
    tokens += count_tokens_internal(content, model);
  }

  if message.role == "assistant" {
    if let Some(tool_calls) = &message.tool_calls {
      tokens += tool_calls.len() as u32 * TOOL_CALL_TOKEN_COST;
    }
  }

  if let Some(tool_results) = &message.tool_results {
    for result in tool_results {
      tokens += estimate_json_tokens_internal(&result.result, model);
    }
  }

  if message.role == "tool" {
    if let Some(result) = &message.result {
      tokens += estimate_json_tokens_internal(result, model);
    }
  }

  tokens
}

fn truncate_text(text: &str, max_tokens: u32) -> String {
  let max_chars = max_tokens.saturating_mul(TOKEN_APPROX_CHARS) as usize;
  let text_len = text.chars().count();
  if text_len <= max_chars {
    return text.to_string();
  }

  let cut_index = text
    .char_indices()
    .nth(max_chars)
    .map(|(idx, _)| idx)
    .unwrap_or(text.len());
  let truncated = &text[..cut_index];

  let last_period = truncated.rfind('.');
  let last_newline = truncated.rfind('\n');
  let cut_point = match (last_period, last_newline) {
    (Some(period), Some(newline)) => Some(period.max(newline)),
    (Some(period), None) => Some(period),
    (None, Some(newline)) => Some(newline),
    (None, None) => None,
  };

  if let Some(point) = cut_point {
    if point > (max_chars as f32 * 0.7) as usize {
      return format!("{}...", &truncated[..=point]);
    }
  }

  format!("{truncated}...")
}
