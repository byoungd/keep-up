use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

use crate::enclave::{self, EnclaveState};
use crate::node::types::NodePermissionStatus;

#[derive(Debug)]
pub struct DeviceCommandError {
    pub code: String,
    pub message: String,
}

impl DeviceCommandError {
    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            code: "UNSUPPORTED".to_string(),
            message: message.into(),
        }
    }

    fn permission_missing(message: impl Into<String>) -> Self {
        Self {
            code: "PERMISSION_MISSING".to_string(),
            message: message.into(),
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            code: "FAILED".to_string(),
            message: message.into(),
        }
    }
}

pub fn invoke_device_command(
    app: &AppHandle,
    command: &str,
    args: Option<Value>,
    permissions: &HashMap<String, NodePermissionStatus>,
) -> Result<Value, DeviceCommandError> {
    ensure_permissions(command, permissions)?;

    match command {
        "system.notify" => {
            let parsed = args
                .map(|value| serde_json::from_value::<enclave::commands::SystemNotifyArgs>(value))
                .transpose()
                .map_err(|error| {
                    DeviceCommandError::failed(format!("Invalid arguments: {error}"))
                })?
                .unwrap_or(enclave::commands::SystemNotifyArgs {
                    title: None,
                    body: None,
                });

            let state = app.state::<EnclaveState>();
            enclave::commands::system_notify(
                parsed.clone(),
                app.clone(),
                state,
            )
            .map_err(DeviceCommandError::failed)?;

            Ok(json!({
                "delivered": true,
                "title": parsed.title,
                "body": parsed.body,
            }))
        }
        "camera.snap" => {
            let state = app.state::<EnclaveState>();
            enclave::commands::camera_snap(state).map_err(DeviceCommandError::failed)?;
            Ok(json!({"ok": true}))
        }
        "screen.record" => {
            let state = app.state::<EnclaveState>();
            enclave::commands::screen_record(state).map_err(DeviceCommandError::failed)?;
            Ok(json!({"ok": true}))
        }
        "location.get" => {
            let state = app.state::<EnclaveState>();
            let payload = enclave::commands::location_get(state)
                .map_err(DeviceCommandError::failed)?;
            Ok(payload)
        }
        _ => Err(DeviceCommandError::unsupported(format!(
            "Unsupported command: {command}"
        ))),
    }
}

fn ensure_permissions(
    command: &str,
    permissions: &HashMap<String, NodePermissionStatus>,
) -> Result<(), DeviceCommandError> {
    let required = required_permissions(command);
    for permission in required {
        let status = permissions
            .get(*permission)
            .cloned()
            .unwrap_or(NodePermissionStatus::Unknown);
        match status {
            NodePermissionStatus::Granted => {}
            NodePermissionStatus::Unsupported => {
                return Err(DeviceCommandError::unsupported(format!(
                    "Permission unsupported: {permission}"
                )));
            }
            NodePermissionStatus::Denied
            | NodePermissionStatus::Prompt
            | NodePermissionStatus::Unknown => {
                return Err(DeviceCommandError::permission_missing(format!(
                    "Permission missing: {permission}"
                )));
            }
        }
    }
    Ok(())
}

fn required_permissions(command: &str) -> &'static [&'static str] {
    match command {
        "camera.snap" => &["camera"],
        "screen.record" => &["screen"],
        "location.get" => &["location"],
        "system.notify" => &["notifications"],
        _ => &[],
    }
}
