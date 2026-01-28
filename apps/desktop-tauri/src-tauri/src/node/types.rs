use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeCapability {
    pub command: String,
    pub description: Option<String>,
    pub permissions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeDescriptor {
    pub node_id: String,
    pub label: Option<String>,
    pub platform: Option<String>,
    pub capabilities: Vec<NodeCapability>,
    pub permissions: Option<HashMap<String, NodePermissionStatus>>,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodePermissionStatus {
    Granted,
    Denied,
    Prompt,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeError {
    pub code: String,
    pub message: String,
    pub details: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeResponse {
    pub request_id: String,
    pub node_id: String,
    pub success: bool,
    pub result: Option<Value>,
    pub error: Option<NodeError>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum GatewayNodeClientMessage {
    #[serde(rename = "hello")]
    Hello { node: NodeDescriptor },
    #[serde(rename = "describe")]
    Describe { node: NodeDescriptor },
    #[serde(rename = "heartbeat")]
    Heartbeat { #[serde(rename = "nodeId")] node_id: String },
    #[serde(rename = "response")]
    Response { response: NodeResponse },
    #[serde(rename = "ping")]
    Ping { nonce: Option<String> },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum GatewayNodeServerMessage {
    #[serde(rename = "welcome")]
    Welcome {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "serverTime")]
        server_time: u64,
    },
    #[serde(rename = "invoke")]
    Invoke {
        #[serde(rename = "requestId")]
        request_id: String,
        command: String,
        args: Option<Value>,
    },
    #[serde(rename = "error")]
    Error { code: String, message: String },
    #[serde(rename = "pong")]
    Pong {
        nonce: Option<String>,
        #[serde(rename = "serverTime")]
        server_time: u64,
    },
}
