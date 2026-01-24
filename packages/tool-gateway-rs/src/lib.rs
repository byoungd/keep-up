mod engine;
mod types;

use engine::ToolGatewayEngine;
use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::Value;

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

fn parse_input<T: DeserializeOwned>(value: Value, label: &str) -> NapiResult<T> {
    serde_json::from_value(value).map_err(|error| to_napi_error(format!("Invalid {label}: {error}")))
}

#[napi(js_name = "ToolGateway")]
pub struct ToolGatewayBinding {
    engine: ToolGatewayEngine,
}

#[napi]
impl ToolGatewayBinding {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            engine: ToolGatewayEngine::new(),
        }
    }

    #[napi(js_name = "registerManifest")]
    pub fn register_manifest(&self, manifest: Value) -> NapiResult<()> {
        let manifest = parse_input::<types::McpManifest>(manifest, "manifest")?;
        self.engine
            .register_manifest(manifest)
            .map_err(to_napi_error)
    }

    #[napi(js_name = "registerServer")]
    pub fn register_server(&self, config: Value) -> NapiResult<()> {
        let config = parse_input::<types::McpServerConfig>(config, "server config")?;
        self.engine.register_server(config).map_err(to_napi_error)
    }

    #[napi(js_name = "listTools")]
    pub fn list_tools(&self) -> NapiResult<Value> {
        serde_json::to_value(self.engine.list_tools()).map_err(to_napi_error)
    }

    #[napi(js_name = "callTool")]
    pub async fn call_tool(&self, invocation: Value) -> NapiResult<Value> {
        let invocation = parse_input::<types::ToolInvocation>(invocation, "tool invocation")?;
        let result = self.engine.call_tool(invocation).await;
        serde_json::to_value(result).map_err(to_napi_error)
    }

    #[napi(js_name = "grantCapability")]
    pub fn grant_capability(&self, grant: Value) -> NapiResult<String> {
        let grant = parse_input::<types::CapabilityGrantInput>(grant, "capability grant")?;
        Ok(self.engine.grant_capability(grant))
    }

    #[napi(js_name = "revokeCapability")]
    pub fn revoke_capability(&self, grant_id: String) {
        self.engine.revoke_capability(&grant_id);
    }

    #[napi(js_name = "drainAuditEvents")]
    pub fn drain_audit_events(&self, after: Option<i64>, limit: Option<u32>) -> NapiResult<Value> {
        let after = after.and_then(|value| if value >= 0 { Some(value as u64) } else { None });
        let events = self.engine.drain_audit_events(after, limit.map(|value| value as usize));
        serde_json::to_value(events).map_err(to_napi_error)
    }

    #[napi(js_name = "getSnapshot")]
    pub fn get_snapshot(&self) -> NapiResult<Value> {
        serde_json::to_value(self.engine.get_snapshot()).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset(&self) {
        self.engine.reset();
    }
}

pub use types::*;
