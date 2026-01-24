use futures_util::StreamExt;
use napi::bindgen_prelude::Result as NapiResult;
use napi::Error as NapiError;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use uuid::Uuid;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_MAX_RETRIES: u32 = 3;
const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com/v1";
const DEFAULT_ANTHROPIC_VERSION: &str = "2023-06-01";
const STREAM_DONE_MARKER: &str = "[DONE]";

type FabricResult<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ProviderKind {
  Openai,
  Anthropic,
  Gemini,
  Local,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderConfigRecord {
  provider_id: String,
  kind: ProviderKind,
  auth_ref: String,
  base_url: Option<String>,
  timeout_ms: Option<u64>,
  max_retries: Option<u32>,
  organization_id: Option<String>,
  model_ids: Vec<String>,
  default_model_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RouteRule {
  rule_id: String,
  priority: i32,
  worker_id: Option<String>,
  task_type: Option<String>,
  model_id: String,
  fallback_model_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelUsageEvent {
  event_id: String,
  provider_id: String,
  model_id: String,
  input_tokens: u64,
  output_tokens: u64,
  total_tokens: u64,
  latency_ms: u64,
  cost_usd: Option<f64>,
  created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelFabricSnapshot {
  providers: Vec<ProviderConfigRecord>,
  routes: Vec<RouteRule>,
  usage_cursor: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelRequestContext {
  worker_id: Option<String>,
  task_type: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletionRequest {
  model: String,
  messages: Vec<Message>,
  temperature: Option<f64>,
  max_tokens: Option<u64>,
  stop_sequences: Option<Vec<String>>,
  tools: Option<Vec<Tool>>,
  top_p: Option<f64>,
  timeout_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Message {
  role: String,
  content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tool {
  name: String,
  description: String,
  parameters: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolCall {
  id: String,
  name: String,
  arguments: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenUsage {
  input_tokens: u64,
  output_tokens: u64,
  total_tokens: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletionResponse {
  content: String,
  tool_calls: Option<Vec<ToolCall>>,
  usage: TokenUsage,
  finish_reason: String,
  model: String,
  latency_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunk {
  #[serde(rename = "type")]
  chunk_type: String,
  content: Option<String>,
  tool_call: Option<ToolCall>,
  usage: Option<TokenUsage>,
  error: Option<String>,
  finish_reason: Option<String>,
}

#[derive(Default)]
struct ModelFabricState {
  providers: Vec<ProviderConfigRecord>,
  routes: Vec<RouteRule>,
  provider_by_id: HashMap<String, ProviderConfigRecord>,
  model_to_provider: HashMap<String, String>,
  usage_events: Vec<UsageRecord>,
  next_cursor: u64,
}

impl ModelFabricState {
  fn reset(&mut self) {
    self.providers.clear();
    self.routes.clear();
    self.provider_by_id.clear();
    self.model_to_provider.clear();
    self.usage_events.clear();
    self.next_cursor = 0;
  }

  fn update_providers(&mut self, records: Vec<ProviderConfigRecord>) -> FabricResult<()> {
    validate_provider_configs(&records)?;
    let mut ordered = records;
    ordered.sort_by(|a, b| a.provider_id.cmp(&b.provider_id));

    let mut provider_by_id = HashMap::new();
    let mut model_to_provider = HashMap::new();

    for provider in &ordered {
      provider_by_id.insert(provider.provider_id.clone(), provider.clone());
      for model_id in &provider.model_ids {
        model_to_provider.insert(model_id.clone(), provider.provider_id.clone());
      }
    }

    self.providers = ordered;
    self.provider_by_id = provider_by_id;
    self.model_to_provider = model_to_provider;
    Ok(())
  }

  fn update_routes(&mut self, routes: Vec<RouteRule>) {
    let mut ordered = routes;
    ordered.sort_by(|a, b| {
      b.priority
        .cmp(&a.priority)
        .then_with(|| a.rule_id.cmp(&b.rule_id))
    });
    self.routes = ordered;
  }

  fn snapshot(&self) -> ModelFabricSnapshot {
    ModelFabricSnapshot {
      providers: self.providers.clone(),
      routes: self.routes.clone(),
      usage_cursor: self.next_cursor.saturating_sub(1),
    }
  }

  fn record_usage_event(
    &mut self,
    provider_id: String,
    model_id: String,
    usage: &TokenUsage,
    latency_ms: u64,
  ) -> ModelUsageEvent {
    let cursor = self.next_cursor;
    self.next_cursor = self.next_cursor.saturating_add(1);
    let event = ModelUsageEvent {
      event_id: Uuid::new_v4().to_string(),
      provider_id,
      model_id,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
      latency_ms,
      cost_usd: None,
      created_at: now_ms(),
    };
    self.usage_events.push(UsageRecord { cursor, event: event.clone() });
    event
  }

  fn drain_usage_events(&mut self, after: Option<u64>, limit: Option<usize>) -> Vec<ModelUsageEvent> {
    if self.usage_events.is_empty() {
      return Vec::new();
    }

    let mut drained = Vec::new();
    let mut remaining = Vec::with_capacity(self.usage_events.len());
    let allow_all = after.is_none();
    let after_cursor = after.unwrap_or(0);
    let max_items = limit.unwrap_or(usize::MAX);

    for record in self.usage_events.drain(..) {
      if !allow_all && record.cursor <= after_cursor {
        continue;
      }
      if drained.len() < max_items && (allow_all || record.cursor > after_cursor) {
        drained.push(record.event);
      } else {
        remaining.push(record);
      }
    }

    self.usage_events = remaining;
    drained
  }
}

struct UsageRecord {
  cursor: u64,
  event: ModelUsageEvent,
}

#[napi]
pub struct ModelFabric {
  state: Arc<Mutex<ModelFabricState>>,
}

#[napi]
impl ModelFabric {
  #[napi(constructor)]
  pub fn new() -> Self {
    Self {
      state: Arc::new(Mutex::new(ModelFabricState::default())),
    }
  }

  #[napi]
  pub fn load_providers(&self, records: Vec<Value>) -> NapiResult<()> {
    let parsed = parse_records(records)?;
    let mut state = self.state.lock().map_err(to_napi_error)?;
    state.update_providers(parsed).map_err(to_napi_error)
  }

  #[napi]
  pub fn load_routes(&self, routes: Vec<Value>) -> NapiResult<()> {
    let parsed = parse_routes(routes)?;
    let mut state = self.state.lock().map_err(to_napi_error)?;
    state.update_routes(parsed);
    Ok(())
  }

  #[napi]
  pub async fn complete(
    &self,
    request: Value,
    context: Option<Value>,
  ) -> NapiResult<Value> {
    let request = parse_completion_request(request)?;
    let context = parse_context(context)?;

    let preferred_model = if request.model.trim().is_empty() {
      None
    } else {
      Some(request.model.as_str())
    };
    let (candidates, provider_map, providers_by_id) = {
      let state = self.state.lock().map_err(to_napi_error)?;
      let candidates =
        resolve_candidates(&state, context.as_ref(), preferred_model).map_err(to_napi_error)?;
      (candidates, state.model_to_provider.clone(), state.provider_by_id.clone())
    };

    let mut last_error: Option<String> = None;
    for model_id in candidates {
      let provider_id = match provider_map.get(&model_id) {
        Some(id) => id.clone(),
        None => {
          last_error = Some(format!("Model {model_id} not registered"));
          continue;
        }
      };
      let provider = match providers_by_id.get(&provider_id) {
        Some(provider) => provider.clone(),
        None => {
          last_error = Some(format!("Provider {provider_id} not registered"));
          continue;
        }
      };

      match execute_completion(&provider, &model_id, &request).await {
        Ok(response) => {
          let usage = response.usage.clone();
          let latency_ms = response.latency_ms;
          let mut state = self.state.lock().map_err(to_napi_error)?;
          state.record_usage_event(provider.provider_id.clone(), model_id.clone(), &usage, latency_ms);
          return serde_json::to_value(response).map_err(to_napi_error);
        }
        Err(error) => {
          last_error = Some(error);
          continue;
        }
      }
    }

    Err(NapiError::from_reason(
      last_error.unwrap_or_else(|| "No available model route".to_string()),
    ))
  }

  #[napi]
  pub async fn stream(
    &self,
    request: Value,
    context: Option<Value>,
  ) -> NapiResult<ModelStreamHandle> {
    let request = parse_completion_request(request)?;
    let context = parse_context(context)?;

    let preferred_model = if request.model.trim().is_empty() {
      None
    } else {
      Some(request.model.as_str())
    };
    let (candidate, provider_map, providers_by_id) = {
      let state = self.state.lock().map_err(to_napi_error)?;
      let candidates =
        resolve_candidates(&state, context.as_ref(), preferred_model).map_err(to_napi_error)?;
      let primary = candidates.first().cloned().ok_or_else(|| {
        NapiError::from_reason("No available model route".to_string())
      })?;
      (primary, state.model_to_provider.clone(), state.provider_by_id.clone())
    };

    let provider_id = provider_map
      .get(&candidate)
      .cloned()
      .ok_or_else(|| NapiError::from_reason(format!("Model {candidate} not registered")))?;
    let provider = providers_by_id
      .get(&provider_id)
      .cloned()
      .ok_or_else(|| NapiError::from_reason(format!("Provider {provider_id} not registered")))?;

    let (sender, receiver) = mpsc::unbounded_channel();
    let state = self.state.clone();

    tokio::spawn(async move {
      let stream_sender = sender.clone();
      if let Err(error) = execute_stream(state, stream_sender, provider, candidate, request).await {
        let _ = sender.send(StreamChunk {
          chunk_type: "error".to_string(),
          content: None,
          tool_call: None,
          usage: None,
          error: Some(error),
          finish_reason: None,
        });
      }
    });

    Ok(ModelStreamHandle {
      receiver: Arc::new(tokio::sync::Mutex::new(receiver)),
    })
  }

  #[napi]
  pub fn get_snapshot(&self) -> NapiResult<Value> {
    let state = self.state.lock().map_err(to_napi_error)?;
    serde_json::to_value(state.snapshot()).map_err(to_napi_error)
  }

  #[napi]
  pub fn drain_usage_events(
    &self,
    after: Option<i64>,
    limit: Option<u32>,
  ) -> NapiResult<Vec<Value>> {
    let after = after.map(|value| value.max(0) as u64);
    let mut state = self.state.lock().map_err(to_napi_error)?;
    let drained = state.drain_usage_events(after, limit.map(|value| value as usize));
    drained
      .into_iter()
      .map(|event| serde_json::to_value(event).map_err(to_napi_error))
      .collect()
  }

  #[napi]
  pub fn reset(&self) -> NapiResult<()> {
    let mut state = self.state.lock().map_err(to_napi_error)?;
    state.reset();
    Ok(())
  }
}

#[napi]
pub struct ModelStreamHandle {
  receiver: Arc<tokio::sync::Mutex<mpsc::UnboundedReceiver<StreamChunk>>>,
}

#[napi]
impl ModelStreamHandle {
  #[napi]
  pub async fn next(&self) -> NapiResult<Option<Value>> {
    let mut receiver = self.receiver.lock().await;
    match receiver.recv().await {
      Some(chunk) => serde_json::to_value(chunk).map(Some).map_err(to_napi_error),
      None => Ok(None),
    }
  }
}

fn parse_records(records: Vec<Value>) -> NapiResult<Vec<ProviderConfigRecord>> {
  records
    .into_iter()
    .map(|value| serde_json::from_value(value).map_err(to_napi_error))
    .collect()
}

fn parse_routes(routes: Vec<Value>) -> NapiResult<Vec<RouteRule>> {
  routes
    .into_iter()
    .map(|value| serde_json::from_value(value).map_err(to_napi_error))
    .collect()
}

fn parse_completion_request(value: Value) -> NapiResult<CompletionRequest> {
  serde_json::from_value(value).map_err(to_napi_error)
}

fn parse_context(value: Option<Value>) -> NapiResult<Option<ModelRequestContext>> {
  match value {
    Some(value) => serde_json::from_value(value).map(Some).map_err(to_napi_error),
    None => Ok(None),
  }
}

fn validate_provider_configs(records: &[ProviderConfigRecord]) -> FabricResult<()> {
  let mut provider_ids = HashSet::new();
  let mut model_ids = HashSet::new();

  for record in records {
    if record.provider_id.trim().is_empty() {
      return Err("providerId must be non-empty".to_string());
    }
    if record.auth_ref.trim().is_empty() {
      return Err(format!("authRef missing for provider {}", record.provider_id));
    }
    if record.model_ids.is_empty() {
      return Err(format!("provider {} must include modelIds", record.provider_id));
    }
    if record.kind == ProviderKind::Local && record.base_url.is_none() {
      return Err(format!("provider {} requires baseUrl", record.provider_id));
    }
    if !provider_ids.insert(record.provider_id.clone()) {
      return Err(format!("duplicate providerId {}", record.provider_id));
    }

    let mut per_provider = HashSet::new();
    for model_id in &record.model_ids {
      if model_id.trim().is_empty() {
        return Err(format!("provider {} has empty modelId", record.provider_id));
      }
      if !per_provider.insert(model_id) {
        return Err(format!("provider {} has duplicate modelId {}", record.provider_id, model_id));
      }
      if !model_ids.insert(model_id.clone()) {
        return Err(format!("modelId {} configured for multiple providers", model_id));
      }
    }

    if let Some(default_model) = &record.default_model_id {
      if !record.model_ids.contains(default_model) {
        return Err(format!("provider {} defaultModelId not in model list", record.provider_id));
      }
    }
  }

  Ok(())
}

fn resolve_candidates(
  state: &ModelFabricState,
  context: Option<&ModelRequestContext>,
  preferred_model: Option<&str>,
) -> FabricResult<Vec<String>> {
  if let Some(route) = resolve_route(&state.routes, context) {
    let mut candidates = vec![route.model_id];
    if let Some(fallbacks) = route.fallback_model_ids {
      candidates.extend(fallbacks);
    }
    return Ok(candidates);
  }

  if let Some(model_id) = preferred_model {
    if !model_id.trim().is_empty() && state.model_to_provider.contains_key(model_id) {
      return Ok(vec![model_id.to_string()]);
    }
  }

  for provider in &state.providers {
    if let Some(default_model) = &provider.default_model_id {
      return Ok(vec![default_model.clone()]);
    }
  }

  Err("No route matched and no default model configured".to_string())
}

fn resolve_route(routes: &[RouteRule], context: Option<&ModelRequestContext>) -> Option<RouteRule> {
  for route in routes {
    if route_matches(route, context) {
      return Some(route.clone());
    }
  }
  None
}

fn route_matches(route: &RouteRule, context: Option<&ModelRequestContext>) -> bool {
  if route.worker_id.is_none() && route.task_type.is_none() {
    return true;
  }

  let Some(context) = context else {
    return false;
  };

  if let Some(worker_id) = &route.worker_id {
    if context.worker_id.as_ref() != Some(worker_id) {
      return false;
    }
  }

  if let Some(task_type) = &route.task_type {
    if context.task_type.as_ref() != Some(task_type) {
      return false;
    }
  }

  true
}

async fn execute_completion(
  provider: &ProviderConfigRecord,
  model_id: &str,
  request: &CompletionRequest,
) -> FabricResult<CompletionResponse> {
  let retries = provider.max_retries.unwrap_or(DEFAULT_MAX_RETRIES);
  let mut last_error: Option<String> = None;

  for attempt in 0..=retries {
    let result = match provider.kind {
      ProviderKind::Openai | ProviderKind::Gemini | ProviderKind::Local => {
        call_openai_compatible(provider, model_id, request).await
      }
      ProviderKind::Anthropic => call_anthropic(provider, model_id, request).await,
    };

    match result {
      Ok(response) => return Ok(response),
      Err(error) => {
        last_error = Some(error);
        if attempt >= retries {
          break;
        }
      }
    }
  }

  Err(last_error.unwrap_or_else(|| "Provider request failed".to_string()))
}

async fn execute_stream(
  state: Arc<Mutex<ModelFabricState>>,
  sender: mpsc::UnboundedSender<StreamChunk>,
  provider: ProviderConfigRecord,
  model_id: String,
  request: CompletionRequest,
) -> FabricResult<()> {
  let start = tokio::time::Instant::now();
  let mut usage = TokenUsage {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };

  let result = match provider.kind {
    ProviderKind::Openai | ProviderKind::Gemini | ProviderKind::Local => {
      stream_openai_compatible(&sender, &provider, &model_id, &request, &mut usage).await
    }
    ProviderKind::Anthropic => {
      stream_anthropic(&sender, &provider, &model_id, &request, &mut usage).await
    }
  };

  let latency_ms = start.elapsed().as_millis() as u64;
  if result.is_ok() {
    let mut state = state.lock().map_err(|_| "State lock poisoned".to_string())?;
    state.record_usage_event(provider.provider_id.clone(), model_id, &usage, latency_ms);
  }

  result
}

async fn call_openai_compatible(
  provider: &ProviderConfigRecord,
  model_id: &str,
  request: &CompletionRequest,
) -> FabricResult<CompletionResponse> {
  let start = tokio::time::Instant::now();
  let base_url = resolve_base_url(provider);
  let api_key = resolve_api_key(&provider.auth_ref)?;
  let timeout_ms = request
    .timeout_ms
    .or(provider.timeout_ms)
    .unwrap_or(DEFAULT_TIMEOUT_MS);

  let mut body = json!({
    "model": model_id,
    "messages": format_openai_messages(&request.messages),
    "temperature": request.temperature.unwrap_or(1.0),
  });

  if let Some(max_tokens) = request.max_tokens {
    body["max_tokens"] = json!(max_tokens);
  }
  if let Some(top_p) = request.top_p {
    body["top_p"] = json!(top_p);
  }
  if let Some(stop_sequences) = &request.stop_sequences {
    body["stop"] = json!(stop_sequences);
  }
  if let Some(tools) = &request.tools {
    body["tools"] = json!(format_openai_tools(tools));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())?;

  let mut headers = reqwest::header::HeaderMap::new();
  headers.insert(
    reqwest::header::CONTENT_TYPE,
    reqwest::header::HeaderValue::from_static("application/json"),
  );
  headers.insert(
    reqwest::header::AUTHORIZATION,
    reqwest::header::HeaderValue::from_str(&format!("Bearer {api_key}"))
      .map_err(|error| error.to_string())?,
  );
  if provider.kind == ProviderKind::Openai {
    if let Some(org) = &provider.organization_id {
      headers.insert(
        "OpenAI-Organization",
        reqwest::header::HeaderValue::from_str(org).map_err(|error| error.to_string())?,
      );
    }
  }

  let response = client
    .post(format!("{base_url}/chat/completions"))
    .headers(headers)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    return Err(format!("Provider error ({status}): {text}"));
  }

  let parsed: Value = response.json().await.map_err(|error| error.to_string())?;
  let choice = parsed
    .get("choices")
    .and_then(|choices| choices.get(0))
    .ok_or_else(|| "Missing choices".to_string())?;

  let content = choice
    .get("message")
    .and_then(|message| message.get("content"))
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .to_string();

  let tool_calls = choice
    .get("message")
    .and_then(|message| message.get("tool_calls"))
    .and_then(|value| value.as_array())
    .map(|calls| {
      calls
        .iter()
        .filter_map(|call| parse_openai_tool_call(call))
        .collect::<Vec<_>>()
    })
    .filter(|calls| !calls.is_empty());

  let usage = parsed
    .get("usage")
    .and_then(parse_openai_usage)
    .unwrap_or(TokenUsage {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });

  let finish_reason = choice
    .get("finish_reason")
    .and_then(|value| value.as_str())
    .map(map_openai_finish_reason)
    .unwrap_or_else(|| "stop".to_string());

  let model = parsed
    .get("model")
    .and_then(|value| value.as_str())
    .unwrap_or(model_id)
    .to_string();

  Ok(CompletionResponse {
    content,
    tool_calls,
    usage,
    finish_reason,
    model,
    latency_ms: start.elapsed().as_millis() as u64,
  })
}

async fn call_anthropic(
  provider: &ProviderConfigRecord,
  model_id: &str,
  request: &CompletionRequest,
) -> FabricResult<CompletionResponse> {
  let start = tokio::time::Instant::now();
  let base_url = provider
    .base_url
    .clone()
    .unwrap_or_else(|| DEFAULT_ANTHROPIC_BASE_URL.to_string());
  let api_key = resolve_api_key(&provider.auth_ref)?;
  let timeout_ms = request
    .timeout_ms
    .or(provider.timeout_ms)
    .unwrap_or(DEFAULT_TIMEOUT_MS);

  let (system_prompt, messages) = format_anthropic_messages(&request.messages);

  let mut body = json!({
    "model": model_id,
    "messages": messages,
    "max_tokens": request.max_tokens.unwrap_or(4096),
  });

  if let Some(system) = system_prompt {
    body["system"] = json!(system);
  }
  if let Some(temperature) = request.temperature {
    body["temperature"] = json!(temperature);
  }
  if let Some(top_p) = request.top_p {
    body["top_p"] = json!(top_p);
  }
  if let Some(stop_sequences) = &request.stop_sequences {
    body["stop_sequences"] = json!(stop_sequences);
  }
  if let Some(tools) = &request.tools {
    body["tools"] = json!(format_anthropic_tools(tools));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())?;

  let mut headers = reqwest::header::HeaderMap::new();
  headers.insert(
    reqwest::header::CONTENT_TYPE,
    reqwest::header::HeaderValue::from_static("application/json"),
  );
  headers.insert(
    "x-api-key",
    reqwest::header::HeaderValue::from_str(&api_key).map_err(|error| error.to_string())?,
  );
  headers.insert(
    "anthropic-version",
    reqwest::header::HeaderValue::from_static(DEFAULT_ANTHROPIC_VERSION),
  );

  let response = client
    .post(format!("{base_url}/messages"))
    .headers(headers)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    return Err(format!("Provider error ({status}): {text}"));
  }

  let parsed: Value = response.json().await.map_err(|error| error.to_string())?;
  let content = parsed
    .get("content")
    .and_then(|value| value.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|item| {
          if item.get("type")?.as_str()? == "text" {
            item.get("text").and_then(|text| text.as_str()).map(|text| text.to_string())
          } else {
            None
          }
        })
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default();

  let tool_calls = parsed
    .get("content")
    .and_then(|value| value.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|item| parse_anthropic_tool_call(item))
        .collect::<Vec<_>>()
    })
    .filter(|calls| !calls.is_empty());

  let usage = parsed
    .get("usage")
    .and_then(|value| value.as_object())
    .map(|usage| {
      let input = usage
        .get("input_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
      let output = usage
        .get("output_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
      TokenUsage {
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
      }
    })
    .unwrap_or(TokenUsage {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });

  let finish_reason = parsed
    .get("stop_reason")
    .and_then(|value| value.as_str())
    .map(map_anthropic_finish_reason)
    .unwrap_or_else(|| "stop".to_string());

  let model = parsed
    .get("model")
    .and_then(|value| value.as_str())
    .unwrap_or(model_id)
    .to_string();

  Ok(CompletionResponse {
    content,
    tool_calls,
    usage,
    finish_reason,
    model,
    latency_ms: start.elapsed().as_millis() as u64,
  })
}

async fn stream_openai_compatible(
  sender: &mpsc::UnboundedSender<StreamChunk>,
  provider: &ProviderConfigRecord,
  model_id: &str,
  request: &CompletionRequest,
  usage: &mut TokenUsage,
) -> FabricResult<()> {
  let base_url = resolve_base_url(provider);
  let api_key = resolve_api_key(&provider.auth_ref)?;
  let timeout_ms = request
    .timeout_ms
    .or(provider.timeout_ms)
    .unwrap_or(DEFAULT_TIMEOUT_MS);

  let mut body = json!({
    "model": model_id,
    "messages": format_openai_messages(&request.messages),
    "stream": true,
  });

  if let Some(tools) = &request.tools {
    body["tools"] = json!(format_openai_tools(tools));
  }
  if let Some(temperature) = request.temperature {
    body["temperature"] = json!(temperature);
  }
  if let Some(top_p) = request.top_p {
    body["top_p"] = json!(top_p);
  }
  if let Some(max_tokens) = request.max_tokens {
    body["max_tokens"] = json!(max_tokens);
  }
  if let Some(stop_sequences) = &request.stop_sequences {
    body["stop"] = json!(stop_sequences);
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())?;

  let mut headers = reqwest::header::HeaderMap::new();
  headers.insert(
    reqwest::header::CONTENT_TYPE,
    reqwest::header::HeaderValue::from_static("application/json"),
  );
  headers.insert(
    reqwest::header::AUTHORIZATION,
    reqwest::header::HeaderValue::from_str(&format!("Bearer {api_key}"))
      .map_err(|error| error.to_string())?,
  );
  if provider.kind == ProviderKind::Openai {
    if let Some(org) = &provider.organization_id {
      headers.insert(
        "OpenAI-Organization",
        reqwest::header::HeaderValue::from_str(org).map_err(|error| error.to_string())?,
      );
    }
  }

  let response = client
    .post(format!("{base_url}/chat/completions"))
    .headers(headers)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    return Err(format!("Provider error ({status}): {text}"));
  }

  let mut buffer = String::new();
  let mut stream = response.bytes_stream();

  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|error| error.to_string())?;
    buffer.push_str(&String::from_utf8_lossy(&chunk));
    let mut lines: Vec<&str> = buffer.split('\n').collect();
    let remainder = lines.pop().unwrap_or("").to_string();

    for line in lines {
      let line = line.trim_end_matches('\r');
      if let Some(parsed) = parse_openai_sse_line(line) {
        update_usage_from_chunk(&parsed, usage);
        let _ = sender.send(parsed);
      }
    }

    buffer = remainder;
  }

  Ok(())
}

async fn stream_anthropic(
  sender: &mpsc::UnboundedSender<StreamChunk>,
  provider: &ProviderConfigRecord,
  model_id: &str,
  request: &CompletionRequest,
  usage: &mut TokenUsage,
) -> FabricResult<()> {
  let base_url = provider
    .base_url
    .clone()
    .unwrap_or_else(|| DEFAULT_ANTHROPIC_BASE_URL.to_string());
  let api_key = resolve_api_key(&provider.auth_ref)?;
  let timeout_ms = request
    .timeout_ms
    .or(provider.timeout_ms)
    .unwrap_or(DEFAULT_TIMEOUT_MS);

  let (system_prompt, messages) = format_anthropic_messages(&request.messages);

  let mut body = json!({
    "model": model_id,
    "messages": messages,
    "max_tokens": request.max_tokens.unwrap_or(4096),
    "stream": true,
  });

  if let Some(system) = system_prompt {
    body["system"] = json!(system);
  }
  if let Some(temperature) = request.temperature {
    body["temperature"] = json!(temperature);
  }
  if let Some(top_p) = request.top_p {
    body["top_p"] = json!(top_p);
  }
  if let Some(stop_sequences) = &request.stop_sequences {
    body["stop_sequences"] = json!(stop_sequences);
  }
  if let Some(tools) = &request.tools {
    body["tools"] = json!(format_anthropic_tools(tools));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())?;

  let mut headers = reqwest::header::HeaderMap::new();
  headers.insert(
    reqwest::header::CONTENT_TYPE,
    reqwest::header::HeaderValue::from_static("application/json"),
  );
  headers.insert(
    "x-api-key",
    reqwest::header::HeaderValue::from_str(&api_key).map_err(|error| error.to_string())?,
  );
  headers.insert(
    "anthropic-version",
    reqwest::header::HeaderValue::from_static(DEFAULT_ANTHROPIC_VERSION),
  );

  let response = client
    .post(format!("{base_url}/messages"))
    .headers(headers)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    return Err(format!("Provider error ({status}): {text}"));
  }

  let mut buffer = String::new();
  let mut stream = response.bytes_stream();

  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|error| error.to_string())?;
    buffer.push_str(&String::from_utf8_lossy(&chunk));
    let mut lines: Vec<&str> = buffer.split('\n').collect();
    let remainder = lines.pop().unwrap_or("").to_string();

    for line in lines {
      let line = line.trim_end_matches('\r');
      if let Some(parsed) = parse_anthropic_sse_line(line) {
        update_usage_from_chunk(&parsed, usage);
        let _ = sender.send(parsed);
      }
    }

    buffer = remainder;
  }

  Ok(())
}

fn parse_openai_sse_line(line: &str) -> Option<StreamChunk> {
  if !line.starts_with("data: ") {
    return None;
  }
  let data = line.trim_start_matches("data: ").trim();
  if data.is_empty() || data == STREAM_DONE_MARKER {
    return None;
  }

  let parsed: Value = serde_json::from_str(data).ok()?;
  if let Some(usage) = parsed.get("usage").and_then(parse_openai_usage) {
    return Some(StreamChunk {
      chunk_type: "usage".to_string(),
      content: None,
      tool_call: None,
      usage: Some(usage),
      error: None,
      finish_reason: None,
    });
  }

  let choice = parsed.get("choices")?.get(0)?;

  if let Some(content) = choice
    .get("delta")
    .and_then(|delta| delta.get("content"))
    .and_then(|value| value.as_str())
  {
    return Some(StreamChunk {
      chunk_type: "content".to_string(),
      content: Some(content.to_string()),
      tool_call: None,
      usage: None,
      error: None,
      finish_reason: None,
    });
  }

  if let Some(tool_calls) = choice
    .get("delta")
    .and_then(|delta| delta.get("tool_calls"))
    .and_then(|value| value.as_array())
  {
    if let Some(tool_call) = tool_calls.get(0).and_then(parse_openai_tool_call) {
      return Some(StreamChunk {
        chunk_type: "tool_call".to_string(),
        content: None,
        tool_call: Some(tool_call),
        usage: None,
        error: None,
        finish_reason: None,
      });
    }
  }

  if let Some(reason) = choice.get("finish_reason").and_then(|value| value.as_str()) {
    return Some(StreamChunk {
      chunk_type: "done".to_string(),
      content: None,
      tool_call: None,
      usage: parsed.get("usage").and_then(parse_openai_usage),
      error: None,
      finish_reason: Some(map_openai_finish_reason(reason)),
    });
  }

  None
}

fn parse_anthropic_sse_line(line: &str) -> Option<StreamChunk> {
  if !line.starts_with("data: ") {
    return None;
  }
  let data = line.trim_start_matches("data: ").trim();
  if data.is_empty() {
    return None;
  }

  let parsed: Value = serde_json::from_str(data).ok()?;
  let event_type = parsed.get("type")?.as_str()?;

  match event_type {
    "content_block_delta" => {
      if parsed
        .get("delta")
        .and_then(|delta| delta.get("type"))
        .and_then(|value| value.as_str())
        == Some("text_delta")
      {
        if let Some(text) = parsed
          .get("delta")
          .and_then(|delta| delta.get("text"))
          .and_then(|value| value.as_str())
        {
          return Some(StreamChunk {
            chunk_type: "content".to_string(),
            content: Some(text.to_string()),
            tool_call: None,
            usage: None,
            error: None,
            finish_reason: None,
          });
        }
      }
    }
    "message_delta" => {
      if let Some(usage) = parsed.get("usage") {
        let input = usage
          .get("input_tokens")
          .and_then(|value| value.as_u64())
          .unwrap_or(0);
        let output = usage
          .get("output_tokens")
          .and_then(|value| value.as_u64())
          .unwrap_or(0);
        return Some(StreamChunk {
          chunk_type: "usage".to_string(),
          content: None,
          tool_call: None,
          usage: Some(TokenUsage {
            input_tokens: input,
            output_tokens: output,
            total_tokens: input + output,
          }),
          error: None,
          finish_reason: None,
        });
      }
    }
    "message_start" => {
      if let Some(usage) = parsed
        .get("message")
        .and_then(|message| message.get("usage"))
      {
        let input = usage
          .get("input_tokens")
          .and_then(|value| value.as_u64())
          .unwrap_or(0);
        let output = usage
          .get("output_tokens")
          .and_then(|value| value.as_u64())
          .unwrap_or(0);
        return Some(StreamChunk {
          chunk_type: "usage".to_string(),
          content: None,
          tool_call: None,
          usage: Some(TokenUsage {
            input_tokens: input,
            output_tokens: output,
            total_tokens: input + output,
          }),
          error: None,
          finish_reason: None,
        });
      }
    }
    "message_stop" => {
      return Some(StreamChunk {
        chunk_type: "done".to_string(),
        content: None,
        tool_call: None,
        usage: None,
        error: None,
        finish_reason: Some("stop".to_string()),
      });
    }
    _ => {}
  }

  None
}

fn update_usage_from_chunk(chunk: &StreamChunk, usage: &mut TokenUsage) {
  if let Some(chunk_usage) = &chunk.usage {
    usage.input_tokens = chunk_usage.input_tokens;
    usage.output_tokens = chunk_usage.output_tokens;
    usage.total_tokens = chunk_usage.total_tokens;
  }
}

fn parse_openai_tool_call(value: &Value) -> Option<ToolCall> {
  let function = value.get("function")?;
  let name = function.get("name")?.as_str()?.to_string();
  let arguments = function
    .get("arguments")
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .to_string();
  let id = value
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string())
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  Some(ToolCall { id, name, arguments })
}

fn parse_anthropic_tool_call(value: &Value) -> Option<ToolCall> {
  if value.get("type")?.as_str()? != "tool_use" {
    return None;
  }
  let id = value
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string())
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let name = value.get("name")?.as_str()?.to_string();
  let input = value.get("input")?;
  let arguments = serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string());
  Some(ToolCall { id, name, arguments })
}

fn parse_openai_usage(value: &Value) -> Option<TokenUsage> {
  let input = value
    .get("prompt_tokens")
    .and_then(|value| value.as_u64())
    .unwrap_or(0);
  let output = value
    .get("completion_tokens")
    .and_then(|value| value.as_u64())
    .unwrap_or(0);
  let total = value
    .get("total_tokens")
    .and_then(|value| value.as_u64())
    .unwrap_or(input + output);
  Some(TokenUsage {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
  })
}

fn format_openai_messages(messages: &[Message]) -> Vec<Value> {
  messages
    .iter()
    .map(|message| json!({ "role": message.role, "content": message.content }))
    .collect()
}

fn format_openai_tools(tools: &[Tool]) -> Vec<Value> {
  tools
    .iter()
    .map(|tool| {
      json!({
        "type": "function",
        "function": {
          "name": tool.name,
          "description": tool.description,
          "parameters": tool.parameters,
        }
      })
    })
    .collect()
}

fn format_anthropic_messages(messages: &[Message]) -> (Option<String>, Vec<Value>) {
  let mut system_prompt: Option<String> = None;
  let mut formatted: Vec<Value> = Vec::new();

  for message in messages {
    if message.role == "system" {
      system_prompt = Some(match system_prompt {
        Some(existing) => format!("{existing}\n{}", message.content),
        None => message.content.clone(),
      });
    } else {
      formatted.push(json!({
        "role": message.role,
        "content": message.content,
      }));
    }
  }

  if let Some(first) = formatted.first() {
    let role = first
      .get("role")
      .and_then(|value| value.as_str())
      .unwrap_or("");
    if role != "user" {
      formatted.insert(0, json!({ "role": "user", "content": "Hello" }));
    }
  }

  (system_prompt, formatted)
}

fn format_anthropic_tools(tools: &[Tool]) -> Vec<Value> {
  tools
    .iter()
    .map(|tool| {
      json!({
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.parameters,
      })
    })
    .collect()
}

fn map_openai_finish_reason(reason: &str) -> String {
  match reason {
    "stop" => "stop".to_string(),
    "length" => "length".to_string(),
    "tool_calls" | "function_call" => "tool_calls".to_string(),
    "content_filter" => "content_filter".to_string(),
    _ => "stop".to_string(),
  }
}

fn map_anthropic_finish_reason(reason: &str) -> String {
  match reason {
    "end_turn" | "stop_sequence" => "stop".to_string(),
    "max_tokens" => "length".to_string(),
    "tool_use" => "tool_calls".to_string(),
    _ => "stop".to_string(),
  }
}

fn resolve_base_url(provider: &ProviderConfigRecord) -> String {
  if let Some(base_url) = &provider.base_url {
    return base_url.clone();
  }

  match provider.kind {
    ProviderKind::Openai => DEFAULT_OPENAI_BASE_URL.to_string(),
    ProviderKind::Gemini => DEFAULT_GEMINI_BASE_URL.to_string(),
    ProviderKind::Local => DEFAULT_OPENAI_BASE_URL.to_string(),
    ProviderKind::Anthropic => DEFAULT_ANTHROPIC_BASE_URL.to_string(),
  }
}

fn resolve_api_key(auth_ref: &str) -> FabricResult<String> {
  if auth_ref.trim().is_empty() {
    return Err("authRef is empty".to_string());
  }
  if let Ok(value) = std::env::var(auth_ref) {
    if !value.trim().is_empty() {
      return Ok(value);
    }
  }
  Ok(auth_ref.to_string())
}

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_else(|_| Duration::from_secs(0))
    .as_millis() as i64
}

fn to_napi_error(error: impl std::fmt::Display) -> NapiError {
  NapiError::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_missing_models() {
    let record = ProviderConfigRecord {
      provider_id: "openai".to_string(),
      kind: ProviderKind::Openai,
      auth_ref: "key".to_string(),
      base_url: None,
      timeout_ms: None,
      max_retries: None,
      organization_id: None,
      model_ids: vec![],
      default_model_id: None,
    };

    let result = validate_provider_configs(&[record]);
    assert!(result.is_err());
  }

  #[test]
  fn route_selection_respects_priority_and_filters() {
    let routes = vec![
      RouteRule {
        rule_id: "b".to_string(),
        priority: 1,
        worker_id: Some("w1".to_string()),
        task_type: None,
        model_id: "model-low".to_string(),
        fallback_model_ids: None,
      },
      RouteRule {
        rule_id: "a".to_string(),
        priority: 2,
        worker_id: Some("w1".to_string()),
        task_type: Some("task".to_string()),
        model_id: "model-high".to_string(),
        fallback_model_ids: None,
      },
    ];

    let mut state = ModelFabricState::default();
    state.update_routes(routes);

    let context = ModelRequestContext {
      worker_id: Some("w1".to_string()),
      task_type: Some("task".to_string()),
    };

    let selected = resolve_route(&state.routes, Some(&context)).unwrap();
    assert_eq!(selected.model_id, "model-high");
  }

  #[test]
  fn usage_events_include_latency_and_tokens() {
    let mut state = ModelFabricState::default();
    let usage = TokenUsage {
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    };

    let event = state.record_usage_event(
      "provider".to_string(),
      "model".to_string(),
      &usage,
      123,
    );

    assert_eq!(event.input_tokens, 10);
    assert_eq!(event.output_tokens, 20);
    assert_eq!(event.total_tokens, 30);
    assert_eq!(event.latency_ms, 123);
  }

  #[test]
  fn preferred_model_used_when_no_route_matches() {
    let provider = ProviderConfigRecord {
      provider_id: "openai".to_string(),
      kind: ProviderKind::Openai,
      auth_ref: "key".to_string(),
      base_url: None,
      timeout_ms: None,
      max_retries: None,
      organization_id: None,
      model_ids: vec!["model-preferred".to_string()],
      default_model_id: None,
    };

    let mut state = ModelFabricState::default();
    state.update_providers(vec![provider]).unwrap();

    let candidates = resolve_candidates(&state, None, Some("model-preferred")).unwrap();
    assert_eq!(candidates, vec!["model-preferred".to_string()]);
  }
}
