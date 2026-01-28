
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use std::{env, thread};
use tauri::AppHandle;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message};
use tracing::{info, warn};

use super::types::*;

const RECONNECT_DELAY: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_secs(30);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone, Debug)]
struct NodeAdapterConfig {
    enabled: bool,
    gateway_url: String,
    node_id: String,
    node_label: String,
    token: Option<String>,
}

impl NodeAdapterConfig {
    fn from_env() -> Self {
        let enabled = parse_bool_env("KEEPUP_DEVICE_NODE_ENABLED", true);
        let gateway_url = resolve_node_url().unwrap_or_else(|| "ws://localhost:3002".to_string());
        let node_id = resolve_node_id();
        let node_label = resolve_node_name();
        let token = env::var("KEEPUP_DEVICE_NODE_TOKEN")
            .ok()
            .or_else(|| env::var("KEEPUP_GATEWAY_TOKEN").ok());

        Self {
            enabled,
            gateway_url,
            node_id,
            node_label,
            token,
        }
    }
}

pub fn start_device_node(app: AppHandle) {
    let config = NodeAdapterConfig::from_env();
    if config.enabled {
        let app_handle = app.clone();
        thread::spawn(move || {
            run_node_loop(app_handle, config);
        });
    }
}

fn run_node_loop(app: AppHandle, config: NodeAdapterConfig) {
    loop {
        match connect_and_run(&app, &config) {
            Ok(()) => {
                warn!("Device node connection closed");
            }
            Err(error) => {
                warn!("Device node disconnected: {error}");
            }
        }
        thread::sleep(RECONNECT_DELAY);
    }
}

fn connect_and_run(app: &AppHandle, config: &NodeAdapterConfig) -> Result<(), String> {
    let (mut socket, _) = connect(config.gateway_url.as_str()).map_err(|error| error.to_string())?;

    if let MaybeTlsStream::Plain(stream) = socket.get_mut() {
        let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    }

    let permissions = resolve_permissions();
    let hello = build_hello_message(config, &permissions);

    send_message(&mut socket, hello)?;

    info!(node_id = %config.node_id, "Device node connected");

    let mut last_heartbeat = Instant::now();

    loop {
        if last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
            send_message(
                &mut socket,
                NodeMessage::Heartbeat {
                    node_id: config.node_id.clone(),
                },
            )?;
            last_heartbeat = Instant::now();
        }

        match socket.read() {
            Ok(Message::Text(text)) => {
                if let Err(error) = handle_server_message(app, &permissions, &mut socket, text) {
                    warn!("Device node message error: {error}");
                }
            }
            Ok(Message::Binary(payload)) => {
                if let Ok(text) = String::from_utf8(payload) {
                    if let Err(error) = handle_server_message(app, &permissions, &mut socket, text)
                    {
                        warn!("Device node message error: {error}");
                    }
                }
            }
            Ok(Message::Ping(payload)) => {
                socket
                    .send(Message::Pong(payload))
                    .map_err(|error| error.to_string())?;
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => return Ok(()),
            Err(tungstenite::Error::Io(error))
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(error) => {
                return Err(error.to_string());
            }
            _ => {}
        }
    }
}

fn handle_server_message(
    app: &AppHandle,
    permissions: &[NodePermissionStatus],
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    payload: String,
) -> Result<(), String> {
    let message: NodeMessage = serde_json::from_str(&payload).map_err(|error| error.to_string())?;

    match message {
        NodeMessage::Invoke {
            request_id,
            command,
            args,
        } => {
            let response = handle_invoke(app, permissions, request_id, command, args);
            send_message(socket, response)?;
        }
        NodeMessage::Error {
            code,
            message,
            request_id: _,
        } => {
            warn!("Gateway node error: {code} {message}");
        }
        _ => {}
    }

    Ok(())
}

fn handle_invoke(
    app: &AppHandle,
    permissions: &[NodePermissionStatus],
    request_id: String,
    command: String,
    args: Option<Value>,
) -> NodeMessage {
    match invoke_device_command(app, &command, args, permissions) {
        Ok(result) => NodeMessage::Result {
            request_id,
            success: true,
            result: Some(result),
            error: None,
        },
        Err(DeviceCommandError { code, message }) => NodeMessage::Result {
            request_id,
            success: false,
            result: None,
            error: Some(NodeError {
                message,
                code: Some(code),
            }),
        },
    }
}

fn invoke_device_command(
    app: &AppHandle,
    command: &str,
    args: Option<Value>,
    permissions: &[NodePermissionStatus],
) -> Result<Value, DeviceCommandError> {
    if let Some(permission) = required_permission(command) {
        ensure_permission(permissions, permission)?;
    }

    match command {
        "camera.snap" => {
            Ok(json!({ "url": "mock://camera.jpg" }))
        }
        "screen.record" => {
            let action = args
                .as_ref()
                .and_then(|value| value.get("action"))
                .and_then(|value| value.as_str())
                .unwrap_or("start");
            let status = if action.eq_ignore_ascii_case("stop") {
                "recording_stopped"
            } else {
                "recording_started"
            };
            Ok(json!({ "status": status }))
        }
        "location.get" => {
            Ok(json!({ "lat": 37.7749, "lng": -122.4194 }))
        }
        "system.notify" => {
            let message = args
                .as_ref()
                .and_then(|value| value.get("message"))
                .and_then(|value| value.as_str())
                .unwrap_or("Notification");
            use tauri_plugin_dialog::DialogExt;
            app.dialog().message(message).show(|_| {});
            Ok(json!({ "delivered": true }))
        }
        _ => Err(DeviceCommandError {
            code: "UNKNOWN_COMMAND".to_string(),
            message: format!("Command {command} not found"),
        }),
    }
}

struct DeviceCommandError {
    code: String,
    message: String,
}

fn required_permission(command: &str) -> Option<&'static str> {
    match command {
        "camera.snap" => Some("camera"),
        "screen.record" => Some("screen"),
        "location.get" => Some("location"),
        "system.notify" => Some("notifications"),
        _ => None,
    }
}

fn ensure_permission(
    permissions: &[NodePermissionStatus],
    permission: &str,
) -> Result<(), DeviceCommandError> {
    if let Some(status) = permission_status(permissions, permission) {
        if matches!(status, PermissionStatus::Denied) {
            return Err(DeviceCommandError {
                code: "PERMISSION_MISSING".to_string(),
                message: format!("Permission {permission} denied"),
            });
        }
    }
    Ok(())
}

fn permission_status(
    permissions: &[NodePermissionStatus],
    permission: &str,
) -> Option<PermissionStatus> {
    permissions
        .iter()
        .find(|entry| entry.name == permission)
        .map(|entry| entry.status)
}

fn send_message(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    message: NodeMessage,
) -> Result<(), String> {
    let payload = serde_json::to_string(&message).map_err(|error| error.to_string())?;
    socket
        .send(Message::Text(payload))
        .map_err(|error| error.to_string())
}

fn build_hello_message(
    config: &NodeAdapterConfig,
    permissions: &[NodePermissionStatus],
) -> NodeMessage {
    let capabilities = capabilities();
    NodeMessage::Hello {
        node_id: config.node_id.clone(),
        name: Some(config.node_label.clone()),
        kind: Some(format!("desktop-{}", std::env::consts::OS)),
        capabilities,
        permissions: Some(permissions.to_vec()),
        token: config.token.clone(),
    }
}

fn capabilities() -> Vec<NodeCapability> {
    vec![
        NodeCapability {
            command: "camera.snap".to_string(),
            description: Some("Capture a photo from the camera".to_string()),
            permissions: Some(vec!["camera".to_string()]),
        },
        NodeCapability {
            command: "screen.record".to_string(),
            description: Some("Start or stop a screen recording".to_string()),
            permissions: Some(vec!["screen".to_string()]),
        },
        NodeCapability {
            command: "location.get".to_string(),
            description: Some("Read the current device location".to_string()),
            permissions: Some(vec!["location".to_string()]),
        },
        NodeCapability {
            command: "system.notify".to_string(),
            description: Some("Show a desktop notification".to_string()),
            permissions: Some(vec!["notifications".to_string()]),
        },
    ]
}

fn resolve_permissions() -> Vec<NodePermissionStatus> {
    vec![
        NodePermissionStatus {
            name: "camera".to_string(),
            status: parse_permission_env("KEEPUP_DEVICE_PERMISSION_CAMERA", PermissionStatus::Unknown),
            details: None,
        },
        NodePermissionStatus {
            name: "screen".to_string(),
            status: parse_permission_env("KEEPUP_DEVICE_PERMISSION_SCREEN", PermissionStatus::Unknown),
            details: None,
        },
        NodePermissionStatus {
            name: "location".to_string(),
            status: parse_permission_env("KEEPUP_DEVICE_PERMISSION_LOCATION", PermissionStatus::Unknown),
            details: None,
        },
        NodePermissionStatus {
            name: "notifications".to_string(),
            status: parse_permission_env(
                "KEEPUP_DEVICE_PERMISSION_NOTIFICATIONS",
                PermissionStatus::Granted,
            ),
            details: None,
        },
    ]
}

fn parse_permission_env(key: &str, fallback: PermissionStatus) -> PermissionStatus {
    match std::env::var(key) {
        Ok(value) => match value.trim().to_lowercase().as_str() {
            "granted" => PermissionStatus::Granted,
            "denied" => PermissionStatus::Denied,
            "prompt" => PermissionStatus::Prompt,
            "unsupported" => PermissionStatus::Unknown,
            "unknown" => PermissionStatus::Unknown,
            _ => fallback,
        },
        Err(_) => fallback,
    }
}

fn parse_bool_env(key: &str, fallback: bool) -> bool {
    match std::env::var(key) {
        Ok(value) => {
            let normalized = value.trim().to_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => fallback,
    }
}

fn resolve_node_url() -> Option<String> {
    if let Ok(value) = env::var("KEEPUP_GATEWAY_NODE_URL") {
        if !value.trim().is_empty() {
            return Some(value.trim().to_string());
        }
    }
    if let Ok(value) = env::var("COWORK_GATEWAY_NODE_URL") {
        if !value.trim().is_empty() {
            return Some(value.trim().to_string());
        }
    }
    if let Ok(value) = env::var("COWORK_GATEWAY_NODE_PORT") {
        if let Ok(port) = value.parse::<u16>() {
            return Some(format!("ws://localhost:{port}"));
        }
    }
    Some("ws://localhost:3002".to_string())
}

fn resolve_node_id() -> String {
    if let Ok(value) = env::var("KEEPUP_NODE_ID") {
        if !value.trim().is_empty() {
            return value;
        }
    }
    let hostname = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    format!("desktop-{hostname}")
}

fn resolve_node_name() -> String {
    let hostname = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    format!("Desktop ({hostname})")
}
