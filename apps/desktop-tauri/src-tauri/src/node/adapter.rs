use serde_json::{json, Value};
use std::env;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tracing::{error, info, warn};
use tungstenite::{connect, Message};
use tungstenite::stream::MaybeTlsStream;
use url::Url;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const RECONNECT_DELAY: Duration = Duration::from_secs(3);
const READ_TIMEOUT: Duration = Duration::from_millis(250);

pub fn spawn_node_adapter(app: AppHandle) {
    let config = match NodeConfig::from_env(&app) {
        Some(config) => config,
        None => {
            info!("Gateway node adapter disabled");
            return;
        }
    };

    thread::spawn(move || {
        run_adapter(app, config);
    });
}

struct NodeConfig {
    url: String,
    node_id: String,
    name: String,
    kind: String,
    token: Option<String>,
}

impl NodeConfig {
    fn from_env(app: &AppHandle) -> Option<Self> {
        if env_flag_disabled("KEEPUP_NODE_ENABLED") {
            return None;
        }

        let url = resolve_node_url()?;
        let node_id = resolve_node_id();
        let name = resolve_node_name(app);
        let kind = "desktop".to_string();
        let token = env::var("KEEPUP_GATEWAY_TOKEN").ok().filter(|value| !value.is_empty());

        Some(Self {
            url,
            node_id,
            name,
            kind,
            token,
        })
    }
}

fn run_adapter(app: AppHandle, config: NodeConfig) {
    loop {
        let url = match Url::parse(&config.url) {
            Ok(url) => url,
            Err(error) => {
                error!("Invalid gateway node url: {}", error);
                return;
            }
        };

        info!("Connecting to gateway node server: {}", config.url);
        match connect(url.as_str()) {
            Ok((mut socket, _)) => {
                configure_timeouts(&socket);
                if let Err(error) = send_hello(&mut socket, &config) {
                    warn!("Failed to send node hello: {}", error);
                    sleep_backoff();
                    continue;
                }

                let mut last_heartbeat = Instant::now();
                loop {
                    if last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
                        if let Err(error) = send_heartbeat(&mut socket, &config) {
                            warn!("Heartbeat failed: {}", error);
                            break;
                        }
                        last_heartbeat = Instant::now();
                    }

                    match socket.read() {
                        Ok(message) => {
                            if let Err(error) = handle_message(&app, &config, &mut socket, message) {
                                warn!("Node message handling failed: {}", error);
                            }
                        }
                        Err(tungstenite::Error::Io(error))
                            if error.kind() == std::io::ErrorKind::WouldBlock
                                || error.kind() == std::io::ErrorKind::TimedOut =>
                        {
                            continue;
                        }
                        Err(tungstenite::Error::ConnectionClosed) => {
                            info!("Gateway node connection closed");
                            break;
                        }
                        Err(error) => {
                            warn!("Gateway node connection error: {}", error);
                            break;
                        }
                    }
                }
            }
            Err(error) => {
                warn!("Gateway node connection failed: {}", error);
            }
        }

        sleep_backoff();
    }
}

fn configure_timeouts(socket: &tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>) {
    if let MaybeTlsStream::Plain(stream) = socket.get_ref() {
        let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    }
}

fn handle_message(
    app: &AppHandle,
    config: &NodeConfig,
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    message: Message,
) -> Result<(), String> {
    match message {
        Message::Text(text) => handle_text_message(app, config, socket, &text),
        Message::Binary(binary) => {
            let text = String::from_utf8_lossy(&binary);
            handle_text_message(app, config, socket, &text)
        }
        Message::Close(_) => Err("Connection closed".to_string()),
        _ => Ok(()),
    }
}

fn handle_text_message(
    app: &AppHandle,
    _config: &NodeConfig,
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    text: &str,
) -> Result<(), String> {
    let payload: Value = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let message_type = payload
        .get("type")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing message type".to_string())?;

    match message_type {
        "node.invoke" => handle_invoke(app, socket, payload),
        _ => Ok(()),
    }
}

fn handle_invoke(
    app: &AppHandle,
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    payload: Value,
) -> Result<(), String> {
    let request_id = payload
        .get("requestId")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing requestId".to_string())?;
    let command = payload
        .get("command")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing command".to_string())?;
    let args = payload.get("args").cloned();

    let response = execute_command(app, command, args);
    let message = json!({
        "type": "node.result",
        "requestId": request_id,
        "success": response.get("success").and_then(|value| value.as_bool()).unwrap_or(false),
        "result": response.get("result"),
        "error": response.get("error"),
    });

    socket
        .send(Message::Text(message.to_string()))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn execute_command(app: &AppHandle, command: &str, args: Option<Value>) -> Value {
    match command {
        "system.notify" => handle_notify(app, args),
        "camera.snap" => error_response("PERMISSION_MISSING", "Camera permission not granted"),
        "screen.record" => error_response("PERMISSION_MISSING", "Screen recording permission not granted"),
        "location.get" => error_response("PERMISSION_MISSING", "Location permission not granted"),
        _ => error_response("UNSUPPORTED", "Unsupported command"),
    }
}

fn handle_notify(_app: &AppHandle, args: Option<Value>) -> Value {
    let message = args
        .and_then(|value| value.get("message").cloned())
        .and_then(|value| value.as_str().map(|value| value.to_string()))
        .unwrap_or_else(|| "Notification triggered".to_string());
    info!("Node notify: {}", message);
    json!({
        "success": true,
        "result": {
            "delivered": false,
            "message": message,
        }
    })
}

fn error_response(code: &str, message: &str) -> Value {
    json!({
        "success": false,
        "error": {
            "code": code,
            "message": message,
        }
    })
}

fn send_hello(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    config: &NodeConfig,
) -> Result<(), String> {
    let message = json!({
        "type": "node.hello",
        "nodeId": &config.node_id,
        "name": &config.name,
        "kind": &config.kind,
        "capabilities": build_capabilities(),
        "permissions": build_permissions(),
        "token": config.token.as_deref(),
    });

    socket
        .send(Message::Text(message.to_string()))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn send_heartbeat(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    config: &NodeConfig,
) -> Result<(), String> {
    let message = json!({
        "type": "node.heartbeat",
        "nodeId": &config.node_id,
    });
    socket
        .send(Message::Text(message.to_string()))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn build_capabilities() -> Vec<Value> {
    vec![
        json!({
            "command": "camera.snap",
            "description": "Capture a camera snapshot",
            "permissions": ["camera"],
        }),
        json!({
            "command": "screen.record",
            "description": "Record the screen",
            "permissions": ["screen"],
        }),
        json!({
            "command": "location.get",
            "description": "Get current location",
            "permissions": ["location"],
        }),
        json!({
            "command": "system.notify",
            "description": "Post a system notification",
            "permissions": ["notifications"],
        }),
    ]
}

fn build_permissions() -> Vec<Value> {
    vec![
        json!({
            "name": "camera",
            "status": "denied",
            "details": "Camera permission not configured",
        }),
        json!({
            "name": "screen",
            "status": "denied",
            "details": "Screen recording permission not configured",
        }),
        json!({
            "name": "location",
            "status": "denied",
            "details": "Location permission not configured",
        }),
        json!({
            "name": "notifications",
            "status": "granted",
        }),
    ]
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

fn resolve_node_name(app: &AppHandle) -> String {
    let package = app.package_info().name.clone();
    let hostname = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    format!("{package} ({hostname})")
}

fn env_flag_disabled(key: &str) -> bool {
    match env::var(key) {
        Ok(value) => matches!(value.to_lowercase().as_str(), "0" | "false" | "no" | "off"),
        Err(_) => false,
    }
}

fn sleep_backoff() {
    thread::sleep(RECONNECT_DELAY);
}
