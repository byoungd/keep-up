use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxPolicy {
    pub version: String,
    pub name: String,
    pub filesystem: FilesystemPolicy,
    pub network: NetworkPolicy,
    pub commands: CommandPolicy,
    pub limits: ResourceLimits,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilesystemPolicy {
    pub mode: String,
    #[napi(js_name = "allowedPaths")]
    pub allowed_paths: Vec<String>,
    #[napi(js_name = "blockedPaths")]
    pub blocked_paths: Vec<String>,
    #[napi(js_name = "allowSymlinks")]
    pub allow_symlinks: bool,
    #[napi(js_name = "allowHiddenFiles")]
    pub allow_hidden_files: bool,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPolicy {
    pub enabled: bool,
    #[napi(js_name = "allowedDomains")]
    pub allowed_domains: Option<Vec<String>>,
    #[napi(js_name = "blockedDomains")]
    pub blocked_domains: Option<Vec<String>>,
    #[napi(js_name = "allowLocalhost")]
    pub allow_localhost: bool,
    #[napi(js_name = "allowHttps")]
    pub allow_https: bool,
    #[napi(js_name = "allowHttp")]
    pub allow_http: bool,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPolicy {
    pub mode: String,
    #[napi(js_name = "allowedCommands")]
    pub allowed_commands: Option<Vec<String>>,
    #[napi(js_name = "blockedCommands")]
    pub blocked_commands: Option<Vec<String>>,
    #[napi(js_name = "allowSudo")]
    pub allow_sudo: bool,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    #[napi(js_name = "maxFileSize")]
    pub max_file_size: Option<u32>,
    #[napi(js_name = "maxExecutionTime")]
    pub max_execution_time: Option<u32>,
    #[napi(js_name = "maxMemory")]
    pub max_memory: Option<u32>,
}
