use serde::Serialize;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolContent {
    Text { text: String },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Resource {
        uri: String,
        #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
        mime_type: Option<String>,
    },
}

impl ToolContent {
    pub fn text(text: String) -> Self {
        ToolContent::Text { text }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolkitArtifact {
    pub path: String,
    pub size: u64,
    pub checksum: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub success: bool,
    pub content: Vec<ToolContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ToolError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<Vec<ToolkitArtifact>>,
}

impl ToolResult {
    pub fn success(content: Vec<ToolContent>) -> Self {
        Self {
            success: true,
            content,
            error: None,
            artifacts: None,
        }
    }

    pub fn success_with_artifacts(content: Vec<ToolContent>, artifacts: Vec<ToolkitArtifact>) -> Self {
        Self {
            success: true,
            content,
            error: None,
            artifacts: Some(artifacts),
        }
    }

    pub fn error(code: &str, message: String) -> Self {
        Self {
            success: false,
            content: vec![ToolContent::Text { text: message.clone() }],
            error: Some(ToolError {
                code: code.to_string(),
                message,
                details: None,
            }),
            artifacts: None,
        }
    }
}
