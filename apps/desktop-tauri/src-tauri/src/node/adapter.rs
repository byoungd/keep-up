use std::collections::HashMap;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::AppHandle;
use tracing::{info, warn};
use tungstenite::{connect, Message};
use tungstenite::stream::MaybeTlsStream;

use crate::node::commands::{invoke_device_command, DeviceCommandError};
use crate::node::types::{
    GatewayNodeClientMessage, GatewayNodeServerMessage, NodeCapability, NodeDescriptor,
    NodeError, NodePermissionStatus, NodeResponse,
};

const DEFAULT_GATEWAY_PORT: u16 = 18800;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
const RECONNECT_DELAY: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_millis(500);

#[derive(Clone)]
struct NodeAdapterConfig {
    enabled: bool,
    gateway_url: String,
    node_id: String,
    node_label: Option<String>,
}

pub fn start_device_node(app: AppHandle) {
    let config = NodeAdapterConfig::from_env(&app);
    if !config.enabled {
        return;
    }

    thread::spawn(move || run_node_loop(app, config));
}

impl NodeAdapterConfig {
    fn from_env(app: &AppHandle) -> Self {
        let enabled = parse_bool_env("KEEPUP_NODE_ENABLED", true);
        let gateway_url = std::env::var("KEEPUP_GATEWAY_URL").unwrap_or_else(|_| {
            let host = std::env::var("KEEPUP_GATEWAY_HOST")
                .or_else(|_| std::env::var("HOST"))
                .unwrap_or_else(|_| "127.0.0.1".to_string());
            let port = std::env::var("KEEPUP_GATEWAY_PORT")
                .ok()
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(DEFAULT_GATEWAY_PORT);
            format!("ws://{host}:{port}/node")
        });

        let node_id = std::env::var("KEEPUP_NODE_ID").unwrap_or_else(|_| {
            let hostname = std::env::var("HOSTNAME")
                .or_else(|_| std::env::var("COMPUTERNAME"))
                .unwrap_or_else(|_| "desktop".to_string());
            format!("desktop-{hostname}")
        });

        let node_label = std::env::var("KEEPUP_NODE_LABEL").ok().or_else(|| {
            Some(app.package_info().name.clone())
        });

        Self {
            enabled,
            gateway_url,
            node_id,
            node_label,
        }
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
    let descriptor = build_descriptor(app, config, &permissions);

    send_message(&mut socket, GatewayNodeClientMessage::Hello { node: descriptor.clone() })?;

    info!(node_id = %descriptor.node_id, "Device node connected");

    let mut last_heartbeat = Instant::now();

    loop {
        if last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
            send_message(
                &mut socket,
                GatewayNodeClientMessage::Heartbeat {
                    node_id: descriptor.node_id.clone(),
                },
            )?;
            last_heartbeat = Instant::now();
        }

        match socket.read() {
            Ok(Message::Text(text)) => {
                if let Err(error) =
                    handle_server_message(app, &permissions, &descriptor, &mut socket, text)
                {
                    warn!("Device node message error: {error}");
                }
            }
            Ok(Message::Binary(payload)) => {
                if let Ok(text) = String::from_utf8(payload) {
                    if let Err(error) =
                        handle_server_message(app, &permissions, &descriptor, &mut socket, text)
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
    permissions: &HashMap<String, NodePermissionStatus>,
    descriptor: &NodeDescriptor,
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    payload: String,
) -> Result<(), String> {
    let message: GatewayNodeServerMessage =
        serde_json::from_str(&payload).map_err(|error| error.to_string())?;

    match message {
        GatewayNodeServerMessage::Welcome { node_id, .. } => {
            info!(node_id = %node_id, "Gateway acknowledged node");
        }
        GatewayNodeServerMessage::Invoke {
            request_id,
            command,
            args,
        } => {
            let response = handle_invoke(app, permissions, descriptor, request_id, command, args);
            send_message(socket, GatewayNodeClientMessage::Response { response })?;
        }
        GatewayNodeServerMessage::Error { code, message } => {
            warn!("Gateway node error: {code} {message}");
        }
        GatewayNodeServerMessage::Pong { .. } => {}
    }

    Ok(())
}

fn handle_invoke(
    app: &AppHandle,
    permissions: &HashMap<String, NodePermissionStatus>,
    descriptor: &NodeDescriptor,
    request_id: String,
    command: String,
    args: Option<Value>,
) -> NodeResponse {
    match invoke_device_command(app, &command, args, permissions) {
        Ok(result) => NodeResponse {
            request_id,
            node_id: descriptor.node_id.clone(),
            success: true,
            result: Some(result),
            error: None,
        },
        Err(DeviceCommandError { code, message }) => NodeResponse {
            request_id,
            node_id: descriptor.node_id.clone(),
            success: false,
            result: None,
            error: Some(NodeError {
                code,
                message,
                details: None,
            }),
        },
    }
}

fn send_message(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    message: GatewayNodeClientMessage,
) -> Result<(), String> {
    let payload = serde_json::to_string(&message).map_err(|error| error.to_string())?;
    socket
        .send(Message::Text(payload))
        .map_err(|error| error.to_string())
}

fn build_descriptor(
    app: &AppHandle,
    config: &NodeAdapterConfig,
    permissions: &HashMap<String, NodePermissionStatus>,
) -> NodeDescriptor {
    let capabilities = capabilities();
    let metadata = Some(HashMap::from([
        (
            "appVersion".to_string(),
            app.package_info().version.to_string(),
        ),
        ("appName".to_string(), app.package_info().name.clone()),
    ]));

    NodeDescriptor {
        node_id: config.node_id.clone(),
        label: config.node_label.clone(),
        platform: Some(std::env::consts::OS.to_string()),
        capabilities,
        permissions: Some(permissions.clone()),
        metadata,
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

fn resolve_permissions() -> HashMap<String, NodePermissionStatus> {
    let mut permissions = HashMap::new();
    permissions.insert(
        "camera".to_string(),
        parse_permission_env("KEEPUP_DEVICE_PERMISSION_CAMERA", NodePermissionStatus::Unsupported),
    );
    permissions.insert(
        "screen".to_string(),
        parse_permission_env("KEEPUP_DEVICE_PERMISSION_SCREEN", NodePermissionStatus::Unsupported),
    );
    permissions.insert(
        "location".to_string(),
        parse_permission_env("KEEPUP_DEVICE_PERMISSION_LOCATION", NodePermissionStatus::Unsupported),
    );
    permissions.insert(
        "notifications".to_string(),
        parse_permission_env(
            "KEEPUP_DEVICE_PERMISSION_NOTIFICATIONS",
            NodePermissionStatus::Granted,
        ),
    );
    permissions
}

fn parse_permission_env(key: &str, fallback: NodePermissionStatus) -> NodePermissionStatus {
    match std::env::var(key) {
        Ok(value) => match value.trim().to_lowercase().as_str() {
            "granted" => NodePermissionStatus::Granted,
            "denied" => NodePermissionStatus::Denied,
            "prompt" => NodePermissionStatus::Prompt,
            "unsupported" => NodePermissionStatus::Unsupported,
            "unknown" => NodePermissionStatus::Unknown,
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
