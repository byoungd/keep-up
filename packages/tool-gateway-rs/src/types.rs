use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpManifest {
    pub server_id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub tools: Vec<McpTool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub server_id: String,
    pub transport: McpTransport,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub manifest: Option<McpManifest>,
    pub sandbox: Option<ToolGatewaySandboxConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpTransport {
    Stdio,
    Http,
    Websocket,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRegistryEntry {
    pub tool_id: String,
    pub server_id: String,
    pub tool: McpTool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityGrantInput {
    pub grant_id: Option<String>,
    pub capability: String,
    pub issued_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub scope: Option<String>,
    pub approval_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityGrant {
    pub grant_id: String,
    pub capability: String,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub scope: Option<String>,
    pub approval_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInvocation {
    pub tool_id: String,
    pub request_id: String,
    pub run_id: Option<String>,
    pub arguments: Value,
    pub grant_ids: Vec<String>,
    pub redact_keys: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolGatewaySandboxConfig {
    pub network_access: String,
    pub allowed_hosts: Option<Vec<String>>,
    pub allowed_roots: Option<Vec<String>>,
    pub fs_isolation: String,
    pub working_directory: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAuditEvent {
    pub sequence: u64,
    pub tool_id: String,
    pub request_id: String,
    pub grant_ids: Vec<String>,
    pub input_hash: String,
    pub output_hash: String,
    pub success: bool,
    pub duration_ms: u64,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolGatewaySnapshot {
    pub tools: Vec<ToolRegistryEntry>,
    pub grants: Vec<CapabilityGrant>,
    pub audit_cursor: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub annotations: Option<ToolAnnotations>,
    pub metadata: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    pub required_scopes: Option<Vec<String>>,
    pub policy_action: Option<String>,
    pub requires_confirmation: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCall {
    pub id: Option<String>,
    pub name: String,
    pub arguments: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolResult {
    pub success: bool,
    pub content: Vec<Value>,
    pub error: Option<ToolError>,
    pub meta: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolError {
    pub code: ToolErrorCode,
    pub message: String,
    pub details: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ToolErrorCode {
    ExecutionFailed,
    Timeout,
    PermissionDenied,
    SandboxViolation,
    InvalidArguments,
    ResourceNotFound,
}

impl ToolError {
    pub fn new(code: ToolErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }
}

impl McpToolResult {
    pub fn failure(code: ToolErrorCode, message: impl Into<String>) -> Self {
        let message = message.into();
        Self {
            success: false,
            content: vec![serde_json::json!({ "type": "text", "text": message.clone() })],
            error: Some(ToolError::new(code, message)),
            meta: None,
        }
    }

    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::failure(ToolErrorCode::PermissionDenied, message)
    }

    pub fn timeout(message: impl Into<String>) -> Self {
        Self::failure(ToolErrorCode::Timeout, message)
    }

    pub fn resource_not_found(message: impl Into<String>) -> Self {
        Self::failure(ToolErrorCode::ResourceNotFound, message)
    }
}
