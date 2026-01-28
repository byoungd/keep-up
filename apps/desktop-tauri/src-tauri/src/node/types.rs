use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeCapability {
    pub command: String,
    pub description: Option<String>,
    pub permissions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePermissionStatus {
    pub name: String,
    pub status: PermissionStatus,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionStatus {
    Granted,
    Denied,
    Prompt,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeError {
    pub message: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum NodeMessage {
    #[serde(rename = "node.hello")]
    Hello {
        #[serde(rename = "nodeId")]
        node_id: String,
        name: Option<String>,
        kind: Option<String>,
        capabilities: Vec<NodeCapability>,
        permissions: Option<Vec<NodePermissionStatus>>,
        token: Option<String>,
    },
    #[serde(rename = "node.heartbeat")]
    Heartbeat {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    #[serde(rename = "node.invoke")]
    Invoke {
        #[serde(rename = "requestId")]
        request_id: String,
        command: String,
        args: Option<Value>,
    },
    #[serde(rename = "node.result")]
    Result {
        #[serde(rename = "requestId")]
        request_id: String,
        success: bool,
        result: Option<Value>,
        error: Option<NodeError>,
    },
    #[serde(rename = "node.error")]
    Error {
        code: String,
        message: String,
        #[serde(rename = "requestId")]
        request_id: Option<String>,
    },
}
