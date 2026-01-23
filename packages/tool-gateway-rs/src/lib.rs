use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use sandbox_rs::{create_sandbox, EnvVar, ExecOptions, SandboxConfig};

const DEFAULT_MAX_OUTPUT_BYTES: u32 = 64 * 1024;
const DEFAULT_MAX_OUTPUT_LINES: u32 = 200;
const REDACTION_KEYS: [&str; 4] = ["apikey", "token", "secret", "password"];
const COWORK_POLICY_ACTIONS: [&str; 6] = [
  "file.read",
  "file.write",
  "file.*",
  "network.request",
  "connector.read",
  "connector.action",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpManifest {
  server_id: String,
  name: String,
  version: String,
  description: Option<String>,
  tools: Vec<McpTool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpTool {
  name: String,
  description: String,
  input_schema: Value,
  annotations: Option<McpToolAnnotations>,
  metadata: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpToolAnnotations {
  category: Option<String>,
  requires_confirmation: Option<bool>,
  read_only: Option<bool>,
  estimated_duration: Option<String>,
  required_scopes: Option<Vec<String>>,
  policy_action: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum McpTransportConfig {
  #[serde(rename = "stdio")]
  Stdio {
    command: String,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    cwd: Option<String>,
  },
  #[serde(rename = "sse")]
  Sse { url: String },
  #[serde(rename = "streamableHttp")]
  StreamableHttp { url: String },
  #[serde(rename = "http")]
  Http { url: String },
  #[serde(rename = "websocket")]
  Websocket { url: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpServerConfig {
  server_id: String,
  transport: McpTransportConfig,
  manifest: McpManifest,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolRegistryEntry {
  tool_id: String,
  server_id: String,
  tool: McpTool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityGrant {
  grant_id: Option<String>,
  capability: String,
  issued_at: u64,
  expires_at: Option<u64>,
  scope: Option<String>,
  approval_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolInvocation {
  tool_id: String,
  request_id: Option<String>,
  arguments: Value,
  grant_ids: Vec<String>,
  redact_keys: Option<Vec<String>>,
  timeout_ms: Option<u32>,
  max_output_bytes: Option<u32>,
  max_output_lines: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolAuditEvent {
  sequence: u64,
  tool_id: String,
  request_id: Option<String>,
  grant_ids: Vec<String>,
  input_hash: String,
  output_hash: String,
  success: bool,
  duration_ms: u64,
  created_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolGatewaySnapshot {
  tools: Vec<ToolRegistryEntry>,
  grants: Vec<CapabilityGrant>,
  audit_cursor: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpToolCall {
  id: Option<String>,
  name: String,
  arguments: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpToolResult {
  success: bool,
  content: Vec<ToolContent>,
  error: Option<ToolError>,
  meta: Option<ToolMeta>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ToolContent {
  #[serde(rename = "text")]
  Text { text: String },
  #[serde(rename = "image")]
  Image {
    data: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
  },
  #[serde(rename = "resource")]
  Resource {
    uri: String,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
  },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolError {
  code: String,
  message: String,
  details: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolMeta {
  duration_ms: u64,
  tool_name: String,
  sandboxed: bool,
  output_spool: Option<ToolOutputSpoolMetadata>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolOutputSpoolPolicy {
  max_bytes: u32,
  max_lines: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolOutputSpoolMetadata {
  spool_id: String,
  tool_name: String,
  tool_call_id: String,
  created_at: u64,
  uri: String,
  byte_size: u64,
  line_count: u64,
  truncated_bytes: u64,
  truncated_lines: u64,
  policy: ToolOutputSpoolPolicy,
  content_hash: String,
  stored: bool,
  error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ToolOutputSpoolRecord {
  version: u8,
  metadata: ToolOutputSpoolMetadata,
  content: Vec<ToolContent>,
}

struct GatewayState {
  servers: HashMap<String, McpServerConfig>,
  tools: BTreeMap<String, ToolRegistryEntry>,
  grants: HashMap<String, CapabilityGrant>,
  audit_events: Vec<ToolAuditEvent>,
  audit_sequence: u64,
}

impl GatewayState {
  fn new() -> Self {
    Self {
      servers: HashMap::new(),
      tools: BTreeMap::new(),
      grants: HashMap::new(),
      audit_events: Vec::new(),
      audit_sequence: 0,
    }
  }
}

#[napi(js_name = "ToolGateway")]
pub struct ToolGateway {
  state: Arc<Mutex<GatewayState>>,
}

#[napi]
impl ToolGateway {
  #[napi(constructor)]
  pub fn new() -> Self {
    Self {
      state: Arc::new(Mutex::new(GatewayState::new())),
    }
  }

  #[napi]
  pub fn register_manifest(&self, manifest: Value) -> NapiResult<()> {
    let manifest: McpManifest = serde_json::from_value(manifest).map_err(to_napi_error)?;
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;

    if state.servers.contains_key(&manifest.server_id) {
      return Err(to_napi_error(format!(
        "server_id already registered: {}",
        manifest.server_id
      )));
    }

    validate_manifest(&manifest)?;
    register_manifest_entries(&mut state, &manifest)?;
    Ok(())
  }

  #[napi]
  pub fn register_server(&self, config: Value) -> NapiResult<()> {
    let config: McpServerConfig = serde_json::from_value(config).map_err(to_napi_error)?;

    if config.server_id != config.manifest.server_id {
      return Err(to_napi_error("server_id does not match manifest.serverId"));
    }

    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    if state.servers.contains_key(&config.server_id) {
      return Err(to_napi_error(format!(
        "server_id already registered: {}",
        config.server_id
      )));
    }

    validate_manifest(&config.manifest)?;
    let prefix = format!("{}:", config.server_id);
    let existing_tools: HashSet<String> = state
      .tools
      .keys()
      .filter(|tool_id| tool_id.starts_with(&prefix))
      .cloned()
      .collect();

    if existing_tools.is_empty() {
      register_manifest_entries(&mut state, &config.manifest)?;
    } else {
      for tool in &config.manifest.tools {
        let tool_id = format!("{prefix}{}", tool.name);
        if !existing_tools.contains(&tool_id) {
          return Err(to_napi_error(format!(
            "manifest mismatch for server {}",
            config.server_id
          )));
        }
      }
    }
    state.servers.insert(config.server_id.clone(), config);
    Ok(())
  }

  #[napi]
  pub fn list_tools(&self) -> NapiResult<Value> {
    let state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    let tools: Vec<ToolRegistryEntry> = state.tools.values().cloned().collect();
    serde_json::to_value(tools).map_err(to_napi_error)
  }

  #[napi]
  pub async fn call_tool(&self, invocation: Value) -> NapiResult<Value> {
    let invocation: ToolInvocation = serde_json::from_value(invocation).map_err(to_napi_error)?;

    if !invocation.arguments.is_object() {
      let result = error_result(
        "INVALID_ARGUMENTS",
        "arguments must be an object",
        &invocation.tool_id,
        0,
        false,
      );
      return Ok(serialize_result(result)?);
    }

    let (tool_entry, server_config, grants) = {
      let state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
      let tool_entry = match state.tools.get(&invocation.tool_id) {
        Some(entry) => entry.clone(),
        None => {
          let result = error_result(
            "RESOURCE_NOT_FOUND",
            "tool not found",
            &invocation.tool_id,
            0,
            false,
          );
          return Ok(serialize_result(result)?);
        }
      };
      let server_config = match state.servers.get(&tool_entry.server_id) {
        Some(config) => config.clone(),
        None => {
          let result = error_result(
            "RESOURCE_NOT_FOUND",
            "server not registered",
            &tool_entry.tool_id,
            0,
            false,
          );
          return Ok(serialize_result(result)?);
        }
      };

      (tool_entry, server_config, state.grants.clone())
    };

    if let Err(message) = evaluate_grants(&tool_entry.tool, &invocation, &grants) {
      let result = error_result(
        "PERMISSION_DENIED",
        &message,
        &tool_entry.tool_id,
        0,
        false,
      );
      self.record_audit_event(&invocation, &result)?;
      return Ok(serialize_result(result)?);
    }

    let start = Instant::now();
    let (mut result, sandboxed) = execute_tool(&tool_entry, &server_config, &invocation).await;
    let duration_ms = start.elapsed().as_millis() as u64;

    result.meta = Some(ToolMeta {
      duration_ms,
      tool_name: tool_entry.tool_id.clone(),
      sandboxed,
      output_spool: None,
    });

    apply_output_limits(
      &tool_entry.tool_id,
      &invocation,
      &mut result,
      duration_ms,
    );

    self.record_audit_event(&invocation, &result)?;

    Ok(serialize_result(result)?)
  }

  #[napi]
  pub fn grant_capability(&self, grant: Value) -> NapiResult<String> {
    let mut grant: CapabilityGrant = serde_json::from_value(grant).map_err(to_napi_error)?;
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;

    let grant_id = grant
      .grant_id
      .clone()
      .unwrap_or_else(|| Uuid::new_v4().to_string());
    grant.grant_id = Some(grant_id.clone());
    state.grants.insert(grant_id.clone(), grant);
    Ok(grant_id)
  }

  #[napi]
  pub fn revoke_capability(&self, grant_id: String) -> NapiResult<()> {
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    state.grants.remove(&grant_id);
    Ok(())
  }

  #[napi]
  pub fn drain_audit_events(&self, after: Option<u32>, limit: Option<u32>) -> NapiResult<Value> {
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    let start_index = if let Some(after_seq) = after {
      let after_seq = after_seq as u64;
      match state
        .audit_events
        .iter()
        .position(|event| event.sequence > after_seq)
      {
        Some(index) => index,
        None => {
          return serde_json::to_value(Vec::<ToolAuditEvent>::new()).map_err(to_napi_error)
        }
      }
    } else {
      0
    };

    if after.is_some() && start_index > 0 {
      state.audit_events.drain(0..start_index);
    }

    let take_count = limit.map(|value| value as usize).unwrap_or(state.audit_events.len());
    let events: Vec<ToolAuditEvent> = state
      .audit_events
      .iter()
      .take(take_count)
      .cloned()
      .collect();

    serde_json::to_value(events).map_err(to_napi_error)
  }

  #[napi]
  pub fn get_snapshot(&self) -> NapiResult<Value> {
    let state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    let snapshot = ToolGatewaySnapshot {
      tools: state.tools.values().cloned().collect(),
      grants: state.grants.values().cloned().collect(),
      audit_cursor: state.audit_sequence,
    };
    serde_json::to_value(snapshot).map_err(to_napi_error)
  }

  #[napi]
  pub fn reset(&self) -> NapiResult<()> {
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    *state = GatewayState::new();
    Ok(())
  }
}

impl ToolGateway {
  fn record_audit_event(&self, invocation: &ToolInvocation, result: &McpToolResult) -> NapiResult<()> {
    let mut state = self.state.lock().map_err(|_| to_napi_error("state lock poisoned"))?;
    state.audit_sequence += 1;
    let sequence = state.audit_sequence;

    let redaction_keys = build_redaction_set(invocation.redact_keys.as_ref());
    let invocation_value = serde_json::to_value(invocation).map_err(to_napi_error)?;
    let result_value = serde_json::to_value(result).map_err(to_napi_error)?;

    let input_hash = hash_redacted(&invocation_value, &redaction_keys);
    let output_hash = hash_redacted(&result_value, &redaction_keys);

    let duration_ms = result
      .meta
      .as_ref()
      .map(|meta| meta.duration_ms)
      .unwrap_or_default();

    let audit_event = ToolAuditEvent {
      sequence,
      tool_id: invocation.tool_id.clone(),
      request_id: invocation.request_id.clone(),
      grant_ids: invocation.grant_ids.clone(),
      input_hash,
      output_hash,
      success: result.success,
      duration_ms,
      created_at: now_ms(),
    };

    state.audit_events.push(audit_event);
    Ok(())
  }
}

fn validate_manifest(manifest: &McpManifest) -> NapiResult<()> {
  if manifest.server_id.trim().is_empty() {
    return Err(to_napi_error("manifest serverId is required"));
  }
  let mut seen = HashSet::new();
  for tool in &manifest.tools {
    if tool.name.trim().is_empty() {
      return Err(to_napi_error("tool name is required"));
    }
    if tool.description.trim().is_empty() {
      return Err(to_napi_error("tool description is required"));
    }
    if !tool.input_schema.is_object() {
      return Err(to_napi_error("tool inputSchema must be an object"));
    }
    if let Some(existing) = seen.replace(tool.name.clone()) {
      return Err(to_napi_error(format!(
        "duplicate tool name in manifest: {}",
        existing
      )));
    }
    let policy_action = tool
      .annotations
      .as_ref()
      .and_then(|value| value.policy_action.clone())
      .ok_or_else(|| to_napi_error(format!(
        "tool {} is missing annotations.policyAction",
        tool.name
      )))?;

    if !COWORK_POLICY_ACTIONS.contains(&policy_action.as_str()) {
      return Err(to_napi_error(format!(
        "tool {} has invalid policyAction {}",
        tool.name, policy_action
      )));
    }
  }
  Ok(())
}

fn register_manifest_entries(state: &mut GatewayState, manifest: &McpManifest) -> NapiResult<()> {
  let mut tools = manifest.tools.clone();
  tools.sort_by(|a, b| a.name.cmp(&b.name));

  for tool in tools {
    let tool_id = format!("{}:{}", manifest.server_id, tool.name);
    if state.tools.contains_key(&tool_id) {
      return Err(to_napi_error(format!(
        "tool already registered: {}",
        tool_id
      )));
    }
    let entry = ToolRegistryEntry {
      tool_id: tool_id.clone(),
      server_id: manifest.server_id.clone(),
      tool,
    };
    state.tools.insert(tool_id, entry);
  }

  Ok(())
}

fn evaluate_grants(
  tool: &McpTool,
  invocation: &ToolInvocation,
  grants: &HashMap<String, CapabilityGrant>,
) -> Result<(), String> {
  let mut required = HashSet::new();
  if let Some(annotations) = &tool.annotations {
    if let Some(policy_action) = &annotations.policy_action {
      required.insert(policy_action.clone());
    }
    if let Some(scopes) = &annotations.required_scopes {
      for scope in scopes {
        required.insert(scope.clone());
      }
    }
  }

  let now = now_ms();
  let mut has_confirmation = false;

  for grant_id in &invocation.grant_ids {
    if let Some(grant) = grants.get(grant_id) {
      if let Some(expires_at) = grant.expires_at {
        if expires_at <= now {
          continue;
        }
      }
      if grant.approval_id.is_some() {
        has_confirmation = true;
      }
    }
  }

  for scope in required {
    let mut matched = false;
    for grant_id in &invocation.grant_ids {
      if let Some(grant) = grants.get(grant_id) {
        if let Some(expires_at) = grant.expires_at {
          if expires_at <= now {
            continue;
          }
        }
        if grant.capability == scope {
          matched = true;
          break;
        }
      }
    }

    if !matched {
      return Err(format!("missing capability grant for scope {scope}"));
    }
  }

  if tool
    .annotations
    .as_ref()
    .and_then(|value| value.requires_confirmation)
    .unwrap_or(false)
    && !has_confirmation
  {
    return Err("approval required for tool".to_string());
  }

  Ok(())
}

async fn execute_tool(
  entry: &ToolRegistryEntry,
  server: &McpServerConfig,
  invocation: &ToolInvocation,
) -> (McpToolResult, bool) {
  let call = McpToolCall {
    id: invocation.request_id.clone(),
    name: entry.tool.name.clone(),
    arguments: invocation.arguments.clone(),
  };

  match &server.transport {
    McpTransportConfig::Stdio {
      command,
      args,
      env,
      cwd,
    } => {
      let result = execute_stdio(command, args, env, cwd, invocation, &call).await;
      (result, true)
    }
    McpTransportConfig::Http { url }
    | McpTransportConfig::Sse { url }
    | McpTransportConfig::StreamableHttp { url } => {
      let result = execute_http(url, invocation, &call).await;
      (result, false)
    }
    McpTransportConfig::Websocket { .. } => (
      error_result(
        "EXECUTION_FAILED",
        "websocket transport is not supported",
        &entry.tool_id,
        0,
        false,
      ),
      false,
    ),
  }
}

async fn execute_stdio(
  command: &str,
  args: &Option<Vec<String>>,
  env: &Option<HashMap<String, String>>,
  cwd: &Option<String>,
  invocation: &ToolInvocation,
  call: &McpToolCall,
) -> McpToolResult {
  let payload = match serde_json::to_string(call) {
    Ok(value) => value,
    Err(error) => {
      return error_result(
        "EXECUTION_FAILED",
        &format!("failed to serialize tool call: {error}"),
        &invocation.tool_id,
        0,
        true,
      );
    }
  };

  let sandbox = match create_sandbox(SandboxConfig {
    network_access: "full".to_string(),
    allowed_hosts: None,
    allowed_roots: None,
    fs_isolation: "none".to_string(),
    working_directory: None,
  }) {
    Ok(value) => value,
    Err(error) => {
      return error_result(
        "EXECUTION_FAILED",
        &format!("failed to create sandbox: {error}"),
        &invocation.tool_id,
        0,
        true,
      );
    }
  };

  let env_pairs = env.as_ref().map(|pairs| {
    pairs
      .iter()
      .map(|(key, value)| EnvVar {
        key: key.clone(),
        value: value.clone(),
      })
      .collect::<Vec<_>>()
  });

  let options = ExecOptions {
    cwd: cwd.clone(),
    timeout_ms: invocation.timeout_ms,
    stdin: Some(payload),
    max_output_bytes: invocation.max_output_bytes,
    env: env_pairs,
  };

  let exec_result = match sandbox
    .execute(
      command.to_string(),
      args.clone().unwrap_or_default(),
      Some(options),
    )
    .await
  {
    Ok(result) => result,
    Err(error) => {
      return error_result(
        "EXECUTION_FAILED",
        &format!("sandbox execution failed: {error}"),
        &invocation.tool_id,
        0,
        true,
      );
    }
  };

  if exec_result.timed_out {
    return error_result(
      "TIMEOUT",
      "tool execution timed out",
      &invocation.tool_id,
      0,
      true,
    );
  }

  if exec_result.exit_code != 0 {
    return error_result(
      "EXECUTION_FAILED",
      &format!(
        "tool process exited with code {}: {}",
        exec_result.exit_code, exec_result.stderr
      ),
      &invocation.tool_id,
      0,
      true,
    );
  }

  if exec_result.truncated {
    return error_result(
      "EXECUTION_FAILED",
      "tool output was truncated",
      &invocation.tool_id,
      0,
      true,
    );
  }

  match serde_json::from_str::<McpToolResult>(&exec_result.stdout) {
    Ok(result) => result,
    Err(error) => error_result(
      "EXECUTION_FAILED",
      &format!("invalid tool response: {error}"),
      &invocation.tool_id,
      0,
      true,
    ),
  }
}

async fn execute_http(
  url: &str,
  invocation: &ToolInvocation,
  call: &McpToolCall,
) -> McpToolResult {
  let client = match reqwest::Client::builder()
    .timeout(Duration::from_millis(
      invocation.timeout_ms.unwrap_or(30_000) as u64,
    ))
    .build()
  {
    Ok(client) => client,
    Err(error) => {
      return error_result(
        "EXECUTION_FAILED",
        &format!("failed to create http client: {error}"),
        &invocation.tool_id,
        0,
        false,
      );
    }
  };

  let response = match client.post(url).json(call).send().await {
    Ok(response) => response,
    Err(error) => {
      return error_result(
        "EXECUTION_FAILED",
        &format!("http request failed: {error}"),
        &invocation.tool_id,
        0,
        false,
      );
    }
  };

  if !response.status().is_success() {
    return error_result(
      "EXECUTION_FAILED",
      &format!("http response status {}", response.status()),
      &invocation.tool_id,
      0,
      false,
    );
  }

  match response.json::<McpToolResult>().await {
    Ok(result) => result,
    Err(error) => error_result(
      "EXECUTION_FAILED",
      &format!("invalid tool response: {error}"),
      &invocation.tool_id,
      0,
      false,
    ),
  }
}

fn apply_output_limits(
  tool_name: &str,
  invocation: &ToolInvocation,
  result: &mut McpToolResult,
  duration_ms: u64,
) {
  let policy = ToolOutputSpoolPolicy {
    max_bytes: invocation
      .max_output_bytes
      .unwrap_or(DEFAULT_MAX_OUTPUT_BYTES)
      .max(1),
    max_lines: invocation
      .max_output_lines
      .unwrap_or(DEFAULT_MAX_OUTPUT_LINES)
      .max(1),
  };

  let stats = content_stats(&result.content);
  if stats.byte_size <= policy.max_bytes as u64 && stats.line_count <= policy.max_lines as u64 {
    return;
  }

  let tool_call_id = invocation
    .request_id
    .clone()
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let spool_id = Uuid::new_v4().to_string();

  let record = ToolOutputSpoolRecord {
    version: 1,
    metadata: ToolOutputSpoolMetadata {
      spool_id: spool_id.clone(),
      tool_name: tool_name.to_string(),
      tool_call_id: tool_call_id.clone(),
      created_at: now_ms(),
      uri: String::new(),
      byte_size: stats.byte_size,
      line_count: stats.line_count,
      truncated_bytes: 0,
      truncated_lines: 0,
      policy: policy.clone(),
      content_hash: hash_value(&serde_json::to_value(&result.content).unwrap_or(Value::Null)),
      stored: false,
      error: None,
    },
    content: result.content.clone(),
  };

  let (spool_meta, truncated_content) = spool_and_truncate(record, policy);
  result.content = truncated_content;

  let meta = result.meta.take().unwrap_or(ToolMeta {
    duration_ms,
    tool_name: tool_name.to_string(),
    sandboxed: false,
    output_spool: None,
  });

  result.meta = Some(ToolMeta {
    output_spool: Some(spool_meta),
    ..meta
  });
}

fn spool_and_truncate(
  mut record: ToolOutputSpoolRecord,
  policy: ToolOutputSpoolPolicy,
) -> (ToolOutputSpoolMetadata, Vec<ToolContent>) {
  let (truncated, used_bytes, used_lines) = truncate_content(&record.content, &policy);
  let truncated_bytes = record
    .metadata
    .byte_size
    .saturating_sub(used_bytes);
  let truncated_lines = record
    .metadata
    .line_count
    .saturating_sub(used_lines);

  let mut metadata = record.metadata;
  metadata.truncated_bytes = truncated_bytes;
  metadata.truncated_lines = truncated_lines;

  let spool_path = std::env::temp_dir().join(format!("tool-output-{0}.json", metadata.spool_id));
  metadata.uri = spool_path.to_string_lossy().to_string();
  record.metadata = metadata.clone();

  match serde_json::to_vec(&record) {
    Ok(bytes) => {
      if let Err(error) = std::fs::write(&spool_path, bytes) {
        metadata.stored = false;
        metadata.error = Some(error.to_string());
      } else {
        metadata.stored = true;
      }
    }
    Err(error) => {
      metadata.stored = false;
      metadata.error = Some(error.to_string());
    }
  }

  (metadata, truncated)
}

struct ContentStats {
  byte_size: u64,
  line_count: u64,
}

fn content_stats(content: &[ToolContent]) -> ContentStats {
  let mut byte_size = 0u64;
  let mut line_count = 0u64;
  for item in content {
    if let ToolContent::Text { text } = item {
      byte_size += text.as_bytes().len() as u64;
      line_count += count_lines(text) as u64;
    }
  }
  ContentStats {
    byte_size,
    line_count,
  }
}

fn count_lines(text: &str) -> usize {
  if text.is_empty() {
    return 0;
  }
  text.lines().count()
}

fn truncate_content(
  content: &[ToolContent],
  policy: &ToolOutputSpoolPolicy,
) -> (Vec<ToolContent>, u64, u64) {
  let mut remaining_bytes = policy.max_bytes as i64;
  let mut remaining_lines = policy.max_lines as i64;
  let mut output = Vec::new();
  let mut used_bytes = 0u64;
  let mut used_lines = 0u64;

  for item in content {
    match item {
      ToolContent::Text { text } => {
        if remaining_bytes <= 0 || remaining_lines <= 0 {
          break;
        }
        let (truncated, bytes_used, lines_used) =
          truncate_text(text, remaining_bytes as u64, remaining_lines as u64);
        remaining_bytes -= bytes_used as i64;
        remaining_lines -= lines_used as i64;
        used_bytes += bytes_used;
        used_lines += lines_used;
        if !truncated.is_empty() {
          output.push(ToolContent::Text { text: truncated });
        }
      }
      _ => output.push(item.clone()),
    }
  }

  (output, used_bytes, used_lines)
}

fn truncate_text(text: &str, max_bytes: u64, max_lines: u64) -> (String, u64, u64) {
  if max_bytes == 0 || max_lines == 0 {
    return (String::new(), 0, 0);
  }

  let mut bytes_used = 0u64;
  let mut lines_used = 0u64;
  let mut end_index = 0usize;

  for (idx, ch) in text.char_indices() {
    let ch_bytes = ch.len_utf8() as u64;
    let next_bytes = bytes_used + ch_bytes;
    let next_lines = lines_used + if ch == '\n' { 1 } else { 0 };
    let effective_lines = if next_lines == 0 { 1 } else { next_lines };

    if next_bytes > max_bytes || effective_lines > max_lines {
      break;
    }

    bytes_used = next_bytes;
    lines_used = effective_lines;
    end_index = idx + ch.len_utf8();
  }

  (text[..end_index].to_string(), bytes_used, lines_used)
}

fn error_result(
  code: &str,
  message: &str,
  tool_name: &str,
  duration_ms: u64,
  sandboxed: bool,
) -> McpToolResult {
  McpToolResult {
    success: false,
    content: Vec::new(),
    error: Some(ToolError {
      code: code.to_string(),
      message: message.to_string(),
      details: None,
    }),
    meta: Some(ToolMeta {
      duration_ms,
      tool_name: tool_name.to_string(),
      sandboxed,
      output_spool: None,
    }),
  }
}

fn serialize_result(result: McpToolResult) -> NapiResult<Value> {
  serde_json::to_value(result).map_err(to_napi_error)
}

fn build_redaction_set(keys: Option<&Vec<String>>) -> HashSet<String> {
  let mut set: HashSet<String> = REDACTION_KEYS.iter().map(|key| key.to_string()).collect();
  if let Some(keys) = keys {
    for key in keys {
      set.insert(key.trim().to_lowercase());
    }
  }
  set
}

fn hash_redacted(value: &Value, keys: &HashSet<String>) -> String {
  let redacted = redact_value(value, keys);
  hash_value(&redacted)
}

fn hash_value(value: &Value) -> String {
  let canonical = canonicalize_value(value);
  let serialized = serde_json::to_string(&canonical).unwrap_or_default();
  let mut hasher = Sha256::new();
  hasher.update(serialized.as_bytes());
  format!("{:x}", hasher.finalize())
}

fn redact_value(value: &Value, keys: &HashSet<String>) -> Value {
  match value {
    Value::Object(map) => {
      let mut redacted = serde_json::Map::new();
      for (key, value) in map {
        if keys.contains(&key.to_lowercase()) {
          redacted.insert(key.clone(), Value::String("[REDACTED]".to_string()));
        } else {
          redacted.insert(key.clone(), redact_value(value, keys));
        }
      }
      Value::Object(redacted)
    }
    Value::Array(items) => {
      let redacted_items = items.iter().map(|item| redact_value(item, keys)).collect();
      Value::Array(redacted_items)
    }
    _ => value.clone(),
  }
}

fn canonicalize_value(value: &Value) -> Value {
  match value {
    Value::Object(map) => {
      let mut keys: Vec<String> = map.keys().cloned().collect();
      keys.sort();
      let mut ordered = serde_json::Map::new();
      for key in keys {
        if let Some(val) = map.get(&key) {
          ordered.insert(key, canonicalize_value(val));
        }
      }
      Value::Object(ordered)
    }
    Value::Array(items) => {
      let items = items.iter().map(canonicalize_value).collect();
      Value::Array(items)
    }
    _ => value.clone(),
  }
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
  napi::Error::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sample_tool(name: &str) -> McpTool {
    McpTool {
      name: name.to_string(),
      description: "test".to_string(),
      input_schema: serde_json::json!({"type": "object"}),
      annotations: Some(McpToolAnnotations {
        category: None,
        requires_confirmation: None,
        read_only: None,
        estimated_duration: None,
        required_scopes: None,
        policy_action: Some("file.read".to_string()),
      }),
      metadata: None,
    }
  }

  #[test]
  fn manifest_rejects_duplicate_tool_names() {
    let manifest = McpManifest {
      server_id: "srv".to_string(),
      name: "srv".to_string(),
      version: "1".to_string(),
      description: None,
      tools: vec![sample_tool("alpha"), sample_tool("alpha")],
    };

    assert!(validate_manifest(&manifest).is_err());
  }

  #[test]
  fn grant_check_requires_scope() {
    let tool = sample_tool("alpha");
    let invocation = ToolInvocation {
      tool_id: "srv:alpha".to_string(),
      request_id: None,
      arguments: serde_json::json!({}),
      grant_ids: vec!["grant-1".to_string()],
      redact_keys: None,
      timeout_ms: None,
      max_output_bytes: None,
      max_output_lines: None,
    };
    let grants = HashMap::new();

    let result = evaluate_grants(&tool, &invocation, &grants);
    assert!(result.is_err());
  }

  #[test]
  fn redaction_hash_is_deterministic() {
    let value = serde_json::json!({"token": "secret", "nested": {"password": "hidden"}});
    let keys = build_redaction_set(None);
    let first = hash_redacted(&value, &keys);
    let second = hash_redacted(&value, &keys);
    assert_eq!(first, second);
  }
}
