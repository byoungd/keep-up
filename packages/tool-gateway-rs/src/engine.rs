use crate::types::{
    CapabilityGrant, CapabilityGrantInput, McpManifest, McpServerConfig, McpTool, McpToolCall,
    McpToolResult, McpTransport, ToolAuditEvent, ToolGatewaySnapshot, ToolInvocation,
    ToolRegistryEntry, ToolGatewaySandboxConfig,
};
use reqwest::Client;
use reqwest::Url;
#[cfg(not(test))]
use sandbox_rs::{create_sandbox, EnvVar as SandboxEnvVar, ExecOptions as SandboxExecOptions};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

pub struct ToolGatewayEngine {
    state: Arc<Mutex<ToolGatewayState>>,
    http_client: Client,
}

struct ToolGatewayState {
    registry: BTreeMap<String, ToolRegistryEntry>,
    manifests: HashMap<String, McpManifest>,
    servers: HashMap<String, McpServerConfig>,
    grants: HashMap<String, CapabilityGrant>,
    audit_events: Vec<ToolAuditEvent>,
    next_sequence: u64,
}

impl ToolGatewayEngine {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ToolGatewayState {
                registry: BTreeMap::new(),
                manifests: HashMap::new(),
                servers: HashMap::new(),
                grants: HashMap::new(),
                audit_events: Vec::new(),
                next_sequence: 0,
            })),
            http_client: Client::new(),
        }
    }

    pub fn register_manifest(&self, manifest: McpManifest) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "ToolGateway state lock poisoned".to_string())?;

        let server_id = manifest.server_id.clone();
        if state.manifests.contains_key(&server_id) {
            return Err(format!("server_id already registered: {server_id}"));
        }

        let mut tool_names = HashSet::new();
        for tool in &manifest.tools {
            if tool.name.trim().is_empty() {
                return Err("tool name is required".to_string());
            }
            if tool.description.trim().is_empty() {
                return Err(format!("tool description is required: {}", tool.name));
            }
            if tool.input_schema.is_null() {
                return Err(format!("tool inputSchema is required: {}", tool.name));
            }
            if !tool_names.insert(tool.name.clone()) {
                return Err(format!("duplicate tool name: {}", tool.name));
            }
        }

        for tool in &manifest.tools {
            let tool_id = format!("{}:{}", server_id, tool.name);
            if state.registry.contains_key(&tool_id) {
                return Err(format!("duplicate tool id: {tool_id}"));
            }
            state.registry.insert(
                tool_id.clone(),
                ToolRegistryEntry {
                    tool_id,
                    server_id: server_id.clone(),
                    tool: tool.clone(),
                },
            );
        }

        state.manifests.insert(server_id, manifest);
        Ok(())
    }

    pub fn register_server(&self, mut config: McpServerConfig) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "ToolGateway state lock poisoned".to_string())?;

        let server_id = config.server_id.clone();
        if state.servers.contains_key(&server_id) {
            return Err(format!("server already registered: {server_id}"));
        }

        if let Some(manifest) = config.manifest.take() {
            if manifest.server_id != server_id {
                return Err("manifest server_id does not match config".to_string());
            }
            if !state.manifests.contains_key(&server_id) {
                drop(state);
                self.register_manifest(manifest)?;
                state = self
                    .state
                    .lock()
                    .map_err(|_| "ToolGateway state lock poisoned".to_string())?;
            }
        }

        if !state.manifests.contains_key(&server_id) {
            return Err(format!("manifest not registered for server {server_id}"));
        }

        state.servers.insert(server_id, config);
        Ok(())
    }

    pub fn list_tools(&self) -> Vec<ToolRegistryEntry> {
        let state = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => return Vec::new(),
        };
        state.registry.values().cloned().collect()
    }

    pub fn grant_capability(&self, input: CapabilityGrantInput) -> String {
        let mut state = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => return input.grant_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        };

        let grant_id = input
            .grant_id
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let issued_at = input.issued_at.unwrap_or_else(now_epoch_ms);

        let grant = CapabilityGrant {
            grant_id: grant_id.clone(),
            capability: input.capability,
            issued_at,
            expires_at: input.expires_at,
            scope: input.scope,
            approval_id: input.approval_id,
        };

        state.grants.insert(grant_id.clone(), grant);
        grant_id
    }

    pub fn revoke_capability(&self, grant_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.grants.remove(grant_id);
        }
    }

    pub fn drain_audit_events(&self, after: Option<u64>, limit: Option<usize>) -> Vec<ToolAuditEvent> {
        let state = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => return Vec::new(),
        };
        let mut events: Vec<ToolAuditEvent> = state
            .audit_events
            .iter()
            .filter(|event| after.map_or(true, |cursor| event.sequence > cursor))
            .cloned()
            .collect();
        if let Some(limit) = limit {
            events.truncate(limit);
        }
        events
    }

    pub fn get_snapshot(&self) -> ToolGatewaySnapshot {
        let state = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return ToolGatewaySnapshot {
                    tools: Vec::new(),
                    grants: Vec::new(),
                    audit_cursor: 0,
                }
            }
        };

        let mut grants: Vec<CapabilityGrant> = state.grants.values().cloned().collect();
        grants.sort_by(|a, b| a.grant_id.cmp(&b.grant_id));

        ToolGatewaySnapshot {
            tools: state.registry.values().cloned().collect(),
            grants,
            audit_cursor: state.next_sequence,
        }
    }

    pub fn reset(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.registry.clear();
            state.manifests.clear();
            state.servers.clear();
            state.grants.clear();
            state.audit_events.clear();
            state.next_sequence = 0;
        }
    }

    pub async fn call_tool(&self, invocation: ToolInvocation) -> McpToolResult {
        let start = Instant::now();
        let (tool_entry, server_config, grants, requires_confirmation) = {
            let state = match self.state.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    return McpToolResult::failure(
                        crate::types::ToolErrorCode::ExecutionFailed,
                        "Tool gateway unavailable",
                    )
                }
            };

            let entry = match state.registry.get(&invocation.tool_id) {
                Some(entry) => entry.clone(),
                None => return McpToolResult::resource_not_found("Tool not registered"),
            };

            let server_config = match state.servers.get(&entry.server_id) {
                Some(config) => config.clone(),
                None => {
                    return McpToolResult::failure(
                        crate::types::ToolErrorCode::ExecutionFailed,
                        "Tool server not configured",
                    )
                }
            };

            let mut grants = Vec::new();
            for grant_id in &invocation.grant_ids {
                if let Some(grant) = state.grants.get(grant_id) {
                    grants.push(grant.clone());
                }
            }

            let requires_confirmation = entry
                .tool
                .annotations
                .as_ref()
                .and_then(|annotations| annotations.requires_confirmation)
                .unwrap_or(false);

            (entry, server_config, grants, requires_confirmation)
        };

        if let Some(error) = self.validate_grants(&tool_entry.tool, &invocation, &grants, requires_confirmation) {
            let duration_ms = start.elapsed().as_millis() as u64;
            self.record_audit(&tool_entry, &invocation, &error, duration_ms);
            return error;
        }

        let timeout_ms = invocation.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        let call = McpToolCall {
            id: Some(invocation.request_id.clone()),
            name: tool_entry.tool.name.clone(),
            arguments: invocation.arguments.clone(),
        };

        let outcome = self.execute_tool(&server_config, &call, timeout_ms).await;
        let result = match outcome {
            Ok(result) => result,
            Err(ToolExecutionError::Timeout(message)) => McpToolResult::timeout(message),
            Err(ToolExecutionError::PermissionDenied(message)) => {
                McpToolResult::permission_denied(message)
            }
            Err(ToolExecutionError::SandboxViolation(message)) => McpToolResult::failure(
                crate::types::ToolErrorCode::SandboxViolation,
                message,
            ),
            Err(ToolExecutionError::Failure(message)) => {
                McpToolResult::failure(crate::types::ToolErrorCode::ExecutionFailed, message)
            }
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        self.record_audit(&tool_entry, &invocation, &result, duration_ms);
        result
    }

    fn validate_grants(
        &self,
        tool: &McpTool,
        invocation: &ToolInvocation,
        grants: &[CapabilityGrant],
        requires_confirmation: bool,
    ) -> Option<McpToolResult> {
        let mut required_scopes: Vec<String> = Vec::new();
        if let Some(annotations) = &tool.annotations {
            if let Some(scopes) = &annotations.required_scopes {
                required_scopes.extend(scopes.iter().cloned());
            }
            if let Some(policy_action) = &annotations.policy_action {
                required_scopes.push(policy_action.clone());
            }
        }

        let now = now_epoch_ms();
        let mut active_grants: Vec<&CapabilityGrant> = grants
            .iter()
            .filter(|grant| grant.expires_at.map_or(true, |expiry| expiry > now))
            .collect();

        active_grants.sort_by(|a, b| a.grant_id.cmp(&b.grant_id));

        let mut missing_grants = Vec::new();
        let mut seen_grants = HashSet::new();
        for grant_id in &invocation.grant_ids {
            if !seen_grants.insert(grant_id.as_str()) {
                continue;
            }
            let found = active_grants
                .iter()
                .any(|grant| grant.grant_id == *grant_id);
            if !found {
                missing_grants.push(grant_id.clone());
            }
        }

        if !missing_grants.is_empty() {
            return Some(McpToolResult::permission_denied(format!(
                "Missing or expired grants: {}",
                missing_grants.join(", ")
            )));
        }

        for required in required_scopes {
            let has_scope = active_grants
                .iter()
                .any(|grant| grant.capability == required);
            if !has_scope {
                return Some(McpToolResult::permission_denied(format!(
                    "Missing capability grant: {required}"
                )));
            }
        }

        if requires_confirmation {
            let has_approval = active_grants
                .iter()
                .any(|grant| grant.approval_id.is_some());
            if !has_approval {
                return Some(McpToolResult::permission_denied(
                    "Confirmation required for tool invocation",
                ));
            }
        }

        None
    }

    async fn execute_tool(
        &self,
        config: &McpServerConfig,
        call: &McpToolCall,
        timeout_ms: u64,
    ) -> Result<McpToolResult, ToolExecutionError> {
        match config.transport {
            McpTransport::Http => self.execute_http(config, call, timeout_ms).await,
            McpTransport::Stdio => self.execute_stdio(config, call, timeout_ms).await,
            McpTransport::Websocket => Err(ToolExecutionError::Failure(
                "websocket transport not supported".to_string(),
            )),
        }
    }

    async fn execute_http(
        &self,
        config: &McpServerConfig,
        call: &McpToolCall,
        timeout_ms: u64,
    ) -> Result<McpToolResult, ToolExecutionError> {
        let Some(url) = config.url.clone() else {
            return Err(ToolExecutionError::Failure(
                "MCP http transport requires url".to_string(),
            ));
        };
        enforce_network_policy(config.sandbox.as_ref(), &url)?;

        let request = self.http_client.post(url).json(call);
        let response = tokio::time::timeout(Duration::from_millis(timeout_ms), request.send())
            .await
            .map_err(|_| ToolExecutionError::Timeout("HTTP request timed out".to_string()))
            .and_then(|result| {
                result.map_err(|error| ToolExecutionError::Failure(error.to_string()))
            })?;

        tokio::time::timeout(Duration::from_millis(timeout_ms), response.json::<McpToolResult>())
            .await
            .map_err(|_| ToolExecutionError::Timeout("HTTP response timed out".to_string()))
            .and_then(|result| {
                result.map_err(|error| ToolExecutionError::Failure(error.to_string()))
            })
    }

    #[cfg(not(test))]
    async fn execute_stdio(
        &self,
        config: &McpServerConfig,
        call: &McpToolCall,
        timeout_ms: u64,
    ) -> Result<McpToolResult, ToolExecutionError> {
        let Some(command) = config.command.clone() else {
            return Err(ToolExecutionError::Failure(
                "MCP stdio transport requires command".to_string(),
            ));
        };

        let payload = serde_json::to_string(call)
            .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;
        let options = SandboxExecOptions {
            cwd: None,
            timeout_ms: Some(clamp_timeout(timeout_ms)),
            stdin: Some(format!("{payload}\n")),
            max_output_bytes: None,
            env: build_env_vars(config.env.as_ref()),
        };
        let sandbox_config = resolve_sandbox_config(config.sandbox.as_ref());
        let sandbox = create_sandbox(sandbox_config)
            .map_err(|error| ToolExecutionError::SandboxViolation(error.to_string()))?;

        let result = sandbox
            .execute(command, config.args.clone().unwrap_or_default(), Some(options))
            .await
            .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;

        if result.timed_out {
            return Err(ToolExecutionError::Timeout(
                "Tool execution timed out".to_string(),
            ));
        }

        if result.exit_code != 0 {
            return Err(ToolExecutionError::Failure(result.stderr));
        }

        parse_tool_result(&result.stdout).map_err(|error| ToolExecutionError::Failure(error))
    }

    #[cfg(test)]
    async fn execute_stdio(
        &self,
        config: &McpServerConfig,
        call: &McpToolCall,
        timeout_ms: u64,
    ) -> Result<McpToolResult, ToolExecutionError> {
        use std::process::Stdio;
        use tokio::io::AsyncWriteExt;

        let Some(command) = config.command.clone() else {
            return Err(ToolExecutionError::Failure(
                "MCP stdio transport requires command".to_string(),
            ));
        };

        let mut cmd = tokio::process::Command::new(command);
        if let Some(args) = &config.args {
            cmd.args(args);
        }
        if let Some(env) = &config.env {
            for (key, value) in env {
                cmd.env(key, value);
            }
        }

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;

        if let Some(mut stdin) = child.stdin.take() {
            let payload = serde_json::to_vec(call)
                .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;
            stdin
                .write_all(&payload)
                .await
                .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;
            stdin
                .shutdown()
                .await
                .map_err(|error| ToolExecutionError::Failure(error.to_string()))?;
        }

        let output = tokio::time::timeout(Duration::from_millis(timeout_ms), child.wait_with_output())
            .await
            .map_err(|_| ToolExecutionError::Timeout("Tool execution timed out".to_string()))
            .and_then(|result| result.map_err(|error| ToolExecutionError::Failure(error.to_string())))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(ToolExecutionError::Failure(stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        parse_tool_result(&stdout).map_err(|error| ToolExecutionError::Failure(error))
    }

    fn record_audit(
        &self,
        tool_entry: &ToolRegistryEntry,
        invocation: &ToolInvocation,
        result: &McpToolResult,
        duration_ms: u64,
    ) {
        let redaction_keys = build_redaction_keys(invocation.redact_keys.as_ref());
        let input_hash = hash_payload(&invocation.arguments, &redaction_keys);
        let output_value = serde_json::to_value(result).unwrap_or(Value::Null);
        let output_hash = hash_payload(&output_value, &redaction_keys);

        let mut state = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        state.next_sequence += 1;
        let event = ToolAuditEvent {
            sequence: state.next_sequence,
            tool_id: tool_entry.tool_id.clone(),
            request_id: invocation.request_id.clone(),
            grant_ids: invocation.grant_ids.clone(),
            input_hash,
            output_hash,
            success: result.success,
            duration_ms,
            created_at: now_epoch_ms(),
        };
        state.audit_events.push(event);
    }
}

#[derive(Debug)]
enum ToolExecutionError {
    Timeout(String),
    PermissionDenied(String),
    SandboxViolation(String),
    Failure(String),
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn build_redaction_keys(custom: Option<&Vec<String>>) -> HashSet<String> {
    let mut keys = HashSet::from([
        "apikey".to_string(),
        "api_key".to_string(),
        "token".to_string(),
        "secret".to_string(),
        "password".to_string(),
    ]);

    if let Some(custom) = custom {
        for key in custom {
            keys.insert(key.to_ascii_lowercase());
        }
    }

    keys
}

fn hash_payload(value: &Value, redaction_keys: &HashSet<String>) -> String {
    let redacted = redact_value(value, redaction_keys);
    let normalized = normalize_json(&redacted);
    let payload = serde_json::to_vec(&normalized).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(payload);
    hex::encode(hasher.finalize())
}

fn normalize_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<_> = map.iter().collect();
            entries.sort_by(|(a, _), (b, _)| a.cmp(b));
            let mut normalized = serde_json::Map::new();
            for (key, value) in entries {
                normalized.insert(key.clone(), normalize_json(value));
            }
            Value::Object(normalized)
        }
        Value::Array(values) => Value::Array(values.iter().map(normalize_json).collect()),
        _ => value.clone(),
    }
}

fn redact_value(value: &Value, redaction_keys: &HashSet<String>) -> Value {
    match value {
        Value::Object(map) => {
            let mut redacted = serde_json::Map::new();
            for (key, value) in map {
                if redaction_keys.contains(&key.to_ascii_lowercase()) {
                    redacted.insert(key.clone(), Value::String("<redacted>".to_string()));
                } else {
                    redacted.insert(key.clone(), redact_value(value, redaction_keys));
                }
            }
            Value::Object(redacted)
        }
        Value::Array(values) => Value::Array(values.iter().map(|value| redact_value(value, redaction_keys)).collect()),
        _ => value.clone(),
    }
}

#[cfg(not(test))]
fn resolve_sandbox_config(config: Option<&ToolGatewaySandboxConfig>) -> sandbox_rs::SandboxConfig {
    match config {
        Some(config) => sandbox_rs::SandboxConfig {
            network_access: config.network_access.clone(),
            allowed_hosts: config.allowed_hosts.clone(),
            allowed_roots: config.allowed_roots.clone(),
            fs_isolation: config.fs_isolation.clone(),
            working_directory: config.working_directory.clone(),
        },
        None => sandbox_rs::SandboxConfig {
            network_access: "none".to_string(),
            allowed_hosts: None,
            allowed_roots: None,
            fs_isolation: "none".to_string(),
            working_directory: None,
        },
    }
}

#[cfg(not(test))]
fn build_env_vars(env: Option<&HashMap<String, String>>) -> Option<Vec<SandboxEnvVar>> {
    let env = env?;
    if env.is_empty() {
        return None;
    }
    Some(
        env.iter()
            .map(|(key, value)| SandboxEnvVar {
                key: key.clone(),
                value: value.clone(),
            })
            .collect(),
    )
}

#[cfg(not(test))]
fn clamp_timeout(timeout_ms: u64) -> u32 {
    u32::try_from(timeout_ms).unwrap_or(u32::MAX)
}

fn enforce_network_policy(
    config: Option<&ToolGatewaySandboxConfig>,
    url: &str,
) -> Result<(), ToolExecutionError> {
    let Some(config) = config else {
        return Ok(());
    };

    match config.network_access.as_str() {
        "full" => Ok(()),
        "none" => Err(ToolExecutionError::PermissionDenied(
            "Network access disabled by sandbox policy".to_string(),
        )),
        "allowlist" => {
            let allowed = config.allowed_hosts.as_ref().filter(|hosts| !hosts.is_empty());
            let allowed = match allowed {
                Some(hosts) => hosts,
                None => {
                    return Err(ToolExecutionError::PermissionDenied(
                        "Network allowlist is empty".to_string(),
                    ))
                }
            };

            let parsed = Url::parse(url).map_err(|_| {
                ToolExecutionError::PermissionDenied("Invalid URL".to_string())
            })?;
            let host = parsed.host_str().ok_or_else(|| {
                ToolExecutionError::PermissionDenied("URL host is missing".to_string())
            })?;

            if is_allowed_host(host, allowed) {
                Ok(())
            } else {
                Err(ToolExecutionError::PermissionDenied(format!(
                    "Host {host} not in allowlist"
                )))
            }
        }
        other => Err(ToolExecutionError::Failure(format!(
            "Unknown network access setting: {other}"
        ))),
    }
}

fn is_allowed_host(host: &str, allowed: &[String]) -> bool {
    allowed
        .iter()
        .any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
}

fn parse_tool_result(stdout: &str) -> Result<McpToolResult, String> {
    if let Ok(result) = serde_json::from_str::<McpToolResult>(stdout) {
        return Ok(result);
    }

    let mut last_error = None;
    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<McpToolResult>(trimmed) {
            Ok(result) => return Ok(result),
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to parse tool result".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{McpTool, ToolAnnotations};
    use serde_json::json;

    fn build_tool(name: &str) -> McpTool {
        McpTool {
            name: name.to_string(),
            description: "test".to_string(),
            input_schema: json!({ "type": "object" }),
            annotations: None,
            metadata: None,
        }
    }

    #[tokio::test]
    async fn rejects_duplicate_server_id() {
        let engine = ToolGatewayEngine::new();
        let manifest = McpManifest {
            server_id: "server-a".to_string(),
            name: "Server".to_string(),
            version: "1".to_string(),
            description: None,
            tools: vec![build_tool("tool")],
        };

        engine.register_manifest(manifest.clone()).unwrap();
        let result = engine.register_manifest(manifest);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn rejects_duplicate_tool_names() {
        let engine = ToolGatewayEngine::new();
        let manifest = McpManifest {
            server_id: "server-b".to_string(),
            name: "Server".to_string(),
            version: "1".to_string(),
            description: None,
            tools: vec![build_tool("dup"), build_tool("dup")],
        };

        let result = engine.register_manifest(manifest);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn capability_gating_rejects_missing_grants() {
        let engine = ToolGatewayEngine::new();
        let mut tool = build_tool("secure");
        tool.annotations = Some(ToolAnnotations {
            required_scopes: Some(vec!["scope:read".to_string()]),
            policy_action: None,
            requires_confirmation: None,
        });

        let manifest = McpManifest {
            server_id: "server-c".to_string(),
            name: "Server".to_string(),
            version: "1".to_string(),
            description: None,
            tools: vec![tool],
        };

        engine.register_manifest(manifest).unwrap();
        engine
            .register_server(McpServerConfig {
                server_id: "server-c".to_string(),
                transport: McpTransport::Http,
                command: None,
                args: None,
                env: None,
                url: Some("http://localhost".to_string()),
                manifest: None,
                sandbox: None,
            })
            .unwrap();

        let result = engine
            .call_tool(ToolInvocation {
                tool_id: "server-c:secure".to_string(),
                request_id: "req-1".to_string(),
                run_id: None,
                arguments: json!({ "value": 1 }),
                grant_ids: Vec::new(),
                redact_keys: None,
                timeout_ms: Some(10),
            })
            .await;

        assert!(!result.success);
        assert!(result
            .error
            .as_ref()
            .is_some_and(|error| matches!(error.code, crate::types::ToolErrorCode::PermissionDenied)));
    }

    #[test]
    fn audit_hashes_are_deterministic() {
        let redaction_keys = build_redaction_keys(Some(&vec!["token".to_string()]));
        let payload_a = json!({ "b": 2, "a": { "token": "secret" } });
        let payload_b = json!({ "a": { "token": "secret" }, "b": 2 });

        let hash_a = hash_payload(&payload_a, &redaction_keys);
        let hash_b = hash_payload(&payload_b, &redaction_keys);

        assert_eq!(hash_a, hash_b);
    }
}
