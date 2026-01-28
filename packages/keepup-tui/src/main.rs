use std::fs;
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEvent, KeyModifiers,
};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Wrap};
use ratatui::Terminal;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};
use uuid::Uuid;

const DEFAULT_SESSION_LIMIT: u64 = 20;
const INPUT_PREFIX: &str = "> ";
const INPUT_INDENT: &str = "  ";
const FILTER_PREFIX: &str = "/ ";
const FILTER_INDENT: &str = "  ";
const CLI_CONFIG_FILE: &str = "cli-config.json";
const DEFAULT_STATE_DIR: &str = ".keep-up";
const MAX_CHANGE_FILES: usize = 12;
const MIN_INPUT_HEIGHT: u16 = 3;
const MAX_INPUT_HEIGHT: u16 = 8;
const TAB_WIDTH: usize = 4;
const PASTE_BURST_WINDOW_MS: u64 = 60;
const PASTE_BURST_ACTIVE_MS: u64 = 240;
const PASTE_BURST_THRESHOLD: usize = 8;
const MAX_ARG_PREVIEW_WIDTH: usize = 120;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum WireMessage {
    #[serde(rename = "op")]
    Op {
        id: String,
        op: String,
        payload: Option<Value>,
    },
    #[serde(rename = "result")]
    Result {
        id: String,
        op: String,
        ok: bool,
        payload: Option<Value>,
        error: Option<WireError>,
    },
    #[serde(rename = "event")]
    Event {
        event: String,
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        payload: Option<Value>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct WireError {
    message: String,
    code: Option<String>,
}

#[derive(Debug)]
enum InboundMessage {
    Message(WireMessage),
    Error(String),
    HostExited,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: String,
    title: String,
    message_count: usize,
    #[serde(default)]
    tool_call_count: usize,
    #[serde(default)]
    approval_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    id: String,
    title: String,
    messages: Vec<SessionMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone)]
struct PendingApproval {
    id: String,
    tool_name: String,
    risk: Option<String>,
    reason: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Clone)]
struct GitChanges {
    summary: String,
    files: Vec<GitChangeEntry>,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct GitChangeEntry {
    status: String,
    path: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct HostCapabilities {
    protocol_version: u64,
    ops: Vec<String>,
    features: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunk {
    #[serde(rename = "type")]
    chunk_type: String,
    #[serde(default)]
    data: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamTextData {
    #[serde(default)]
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamProgressData {
    #[serde(default)]
    stage: String,
    #[serde(default)]
    message: String,
    percent: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorData {
    #[serde(default)]
    message: String,
    code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppMode {
    Picker,
    Chat,
}

#[derive(Debug, Clone, Copy)]
enum SettingsMode {
    Model,
    Provider,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone)]
struct ChatMessage {
    role: MessageRole,
    content: String,
}

struct PasteBurst {
    last_plain_at: Option<Instant>,
    burst_count: usize,
    active_until: Option<Instant>,
}

impl PasteBurst {
    fn new() -> Self {
        Self {
            last_plain_at: None,
            burst_count: 0,
            active_until: None,
        }
    }

    fn note_plain_char(&mut self, now: Instant) {
        if let Some(last) = self.last_plain_at {
            if now.duration_since(last) <= Duration::from_millis(PASTE_BURST_WINDOW_MS) {
                self.burst_count += 1;
            } else {
                self.burst_count = 1;
            }
        } else {
            self.burst_count = 1;
        }
        self.last_plain_at = Some(now);

        if self.burst_count >= PASTE_BURST_THRESHOLD {
            self.active_until = Some(now + Duration::from_millis(PASTE_BURST_ACTIVE_MS));
        }
    }

    fn is_active(&self, now: Instant) -> bool {
        self.active_until
            .map(|until| now <= until)
            .unwrap_or(false)
    }

    fn extend(&mut self, now: Instant) {
        if self.is_active(now) {
            self.active_until = Some(now + Duration::from_millis(PASTE_BURST_ACTIVE_MS));
        }
    }

    fn clear_if_idle(&mut self, now: Instant) {
        if let Some(last) = self.last_plain_at {
            if now.duration_since(last) > Duration::from_millis(PASTE_BURST_ACTIVE_MS) {
                self.reset();
            }
        }
    }

    fn reset(&mut self) {
        self.last_plain_at = None;
        self.burst_count = 0;
        self.active_until = None;
    }
}

struct HostClient {
    writer: Arc<Mutex<BufWriter<ChildStdin>>>,
    rx: mpsc::Receiver<InboundMessage>,
    child: Child,
}

struct App {
    mode: AppMode,
    sessions: Vec<SessionSummary>,
    selected: usize,
    messages: Vec<ChatMessage>,
    streaming_text: String,
    chat_scroll: usize,
    chat_viewport_height: usize,
    chat_viewport_width: usize,
    follow_tail: bool,
    chat_unseen: bool,
    paste_burst: PasteBurst,
    input_history: Vec<String>,
    history_index: Option<usize>,
    history_draft: Option<String>,
    input: String,
    cursor: usize,
    status: String,
    show_help: bool,
    pending_prompt: Option<String>,
    pending_session_list: Option<String>,
    pending_session_create: Option<String>,
    pending_session_delete: Option<String>,
    pending_delete_session_id: Option<String>,
    pending_runtime_init: Option<String>,
    pending_hello: Option<String>,
    pending_interrupt: Option<String>,
    pending_approval: Option<PendingApproval>,
    pending_approval_resolve: Option<String>,
    host_caps: Option<HostCapabilities>,
    session_id: Option<String>,
    session_title: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    session_override: Option<String>,
    loading_sessions: bool,
    filter_active: bool,
    session_filter: String,
    session_filter_cursor: usize,
    settings_mode: Option<SettingsMode>,
    settings_input: String,
    settings_cursor: usize,
    git_changes: Option<GitChanges>,
    should_exit: bool,
}

struct TerminalGuard;

impl TerminalGuard {
    fn enter() -> Result<Self> {
        enable_raw_mode().context("enable raw mode")?;
        io::stdout()
            .execute(EnterAlternateScreen)
            .context("enter alternate screen")?;
        io::stdout()
            .execute(EnableBracketedPaste)
            .context("enable bracketed paste")?;
        Ok(Self)
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = io::stdout().execute(DisableBracketedPaste);
        let _ = disable_raw_mode();
        let _ = io::stdout().execute(LeaveAlternateScreen);
    }
}

impl HostClient {
    fn spawn() -> Result<Self> {
        let host_path = resolve_host_path()?;
        let node_bin = resolve_node_bin();

        let mut child = Command::new(node_bin)
            .arg(host_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("spawn host process")?;

        let stdin = child.stdin.take().context("host stdin")?;
        let stdout = child.stdout.take().context("host stdout")?;
        let writer = Arc::new(Mutex::new(BufWriter::new(stdin)));

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(payload) => {
                        if payload.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<WireMessage>(&payload) {
                            Ok(message) => {
                                let _ = tx.send(InboundMessage::Message(message));
                            }
                            Err(error) => {
                                let _ = tx.send(InboundMessage::Error(format!(
                                    "Invalid host message: {error}"
                                )));
                            }
                        }
                    }
                    Err(error) => {
                        let _ = tx.send(InboundMessage::Error(format!(
                            "Host read error: {error}"
                        )));
                        break;
                    }
                }
            }
            let _ = tx.send(InboundMessage::HostExited);
        });

        Ok(Self { writer, rx, child })
    }

    fn send_message(&self, message: &WireMessage) -> Result<()> {
        let serialized = serde_json::to_string(message).context("serialize message")?;
        let mut writer = self.writer.lock().expect("writer lock");
        writer
            .write_all(serialized.as_bytes())
            .context("write host message")?;
        writer.write_all(b"\n").context("write newline")?;
        writer.flush().context("flush host message")?;
        Ok(())
    }

    fn send_op(&self, op: &str, payload: Option<Value>) -> Result<String> {
        let id = format!("req_{}", Uuid::new_v4());
        let message = WireMessage::Op {
            id: id.clone(),
            op: op.to_string(),
            payload,
        };
        self.send_message(&message)?;
        Ok(id)
    }

    fn shutdown(&mut self) {
        let _ = self.send_message(&WireMessage::Op {
            id: format!("req_{}", Uuid::new_v4()),
            op: "client.shutdown".to_string(),
            payload: None,
        });
        let _ = self.child.kill();
    }
}

impl App {
    fn new() -> Self {
        Self {
            mode: AppMode::Picker,
            sessions: Vec::new(),
            selected: 0,
            messages: Vec::new(),
            streaming_text: String::new(),
            chat_scroll: 0,
            chat_viewport_height: 0,
            chat_viewport_width: 0,
            follow_tail: true,
            chat_unseen: false,
            paste_burst: PasteBurst::new(),
            input_history: Vec::new(),
            history_index: None,
            history_draft: None,
            input: String::new(),
            cursor: 0,
            status: "Starting...".to_string(),
            show_help: false,
            pending_prompt: None,
            pending_session_list: None,
            pending_session_create: None,
            pending_session_delete: None,
            pending_delete_session_id: None,
            pending_runtime_init: None,
            pending_hello: None,
            pending_interrupt: None,
            pending_approval: None,
            pending_approval_resolve: None,
            host_caps: None,
            session_id: None,
            session_title: None,
            model: env_value("KEEPUP_TUI_MODEL").or_else(|| load_cli_config_value("model")),
            provider: env_value("KEEPUP_TUI_PROVIDER").or_else(|| load_cli_config_value("provider")),
            session_override: env_value("KEEPUP_TUI_SESSION"),
            loading_sessions: false,
            filter_active: false,
            session_filter: String::new(),
            session_filter_cursor: 0,
            settings_mode: None,
            settings_input: String::new(),
            settings_cursor: 0,
            git_changes: None,
            should_exit: false,
        }
    }

    fn push_message(&mut self, role: MessageRole, content: impl Into<String>) {
        self.messages.push(ChatMessage {
            role,
            content: content.into(),
        });
        self.mark_chat_activity();
    }

    fn push_user_message(&mut self, content: impl Into<String>) {
        self.push_message(MessageRole::User, content);
    }

    fn push_assistant_message(&mut self, content: impl Into<String>) {
        self.push_message(MessageRole::Assistant, content);
    }

    fn push_system_message(&mut self, content: impl Into<String>) {
        self.push_message(MessageRole::System, content);
    }

    fn request_session_list(&mut self, host: &HostClient) -> Result<()> {
        if self.pending_session_list.is_some() {
            return Ok(());
        }
        let id = host.send_op(
            "session.list",
            Some(json!({ "limit": DEFAULT_SESSION_LIMIT })),
        )?;
        self.pending_session_list = Some(id);
        self.loading_sessions = true;
        self.status = "Loading sessions...".to_string();
        Ok(())
    }

    fn request_hello(&mut self, host: &HostClient) -> Result<()> {
        if self.pending_hello.is_some() {
            return Ok(());
        }
        let id = host.send_op("client.hello", None)?;
        self.pending_hello = Some(id);
        self.status = "Connecting...".to_string();
        Ok(())
    }

    fn request_session_create(&mut self, host: &HostClient) -> Result<()> {
        if self.pending_session_create.is_some() {
            return Ok(());
        }
        let id = host.send_op("session.create", None)?;
        self.pending_session_create = Some(id);
        self.status = "Creating session...".to_string();
        Ok(())
    }

    fn request_session_delete(&mut self, host: &HostClient, session_id: String) -> Result<()> {
        if self.pending_session_delete.is_some() {
            return Ok(());
        }
        if !host_supports_op(self, "session.delete") {
            self.status = "Session deletion not supported by host.".to_string();
            return Ok(());
        }
        let payload = json!({ "sessionId": session_id });
        let id = host.send_op("session.delete", Some(payload))?;
        self.pending_session_delete = Some(id);
        self.status = "Deleting session...".to_string();
        Ok(())
    }

    fn request_runtime_init(&mut self, host: &HostClient, session_id: String) -> Result<()> {
        if self.pending_runtime_init.is_some() {
            return Ok(());
        }
        let payload = json!({
            "sessionId": session_id,
            "model": self.model,
            "provider": self.provider,
        });
        let id = host.send_op("runtime.init", Some(payload))?;
        self.pending_runtime_init = Some(id);
        self.status = "Loading session...".to_string();
        Ok(())
    }

    fn request_prompt(&mut self, host: &HostClient, prompt: String) -> Result<()> {
        if self.pending_prompt.is_some() {
            self.status = "Agent is busy.".to_string();
            return Ok(());
        }
        self.streaming_text.clear();
        let payload = json!({ "text": prompt });
        let id = host.send_op("agent.prompt", Some(payload))?;
        self.pending_prompt = Some(id);
        self.status = "Agent running...".to_string();
        Ok(())
    }

    fn request_interrupt(&mut self, host: &HostClient) -> Result<()> {
        if self.pending_interrupt.is_some() {
            return Ok(());
        }
        let id = host.send_op("agent.interrupt", None)?;
        self.pending_interrupt = Some(id);
        self.status = "Interrupting...".to_string();
        Ok(())
    }

    fn request_approval_resolve(&mut self, host: &HostClient, approved: bool) -> Result<()> {
        if self.pending_approval_resolve.is_some() {
            return Ok(());
        }
        if !host_supports_op(self, "approval.resolve") {
            self.status = "Approval resolution not supported by host.".to_string();
            return Ok(());
        }
        let approval = match self.pending_approval.as_ref() {
            Some(pending) => pending,
            None => {
                self.status = "No approval pending.".to_string();
                return Ok(());
            }
        };
        let payload = json!({
            "approvalId": approval.id,
            "approved": approved,
        });
        let id = host.send_op("approval.resolve", Some(payload))?;
        self.pending_approval_resolve = Some(id);
        self.status = if approved {
            "Approval submitted (approved).".to_string()
        } else {
            "Approval submitted (rejected).".to_string()
        };
        Ok(())
    }

    fn insert_input(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.input.insert_str(self.cursor, text);
        self.cursor += text.len();
    }

    fn insert_session_filter(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.session_filter
            .insert_str(self.session_filter_cursor, text);
        self.session_filter_cursor += text.len();
    }

    fn insert_settings_input(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.settings_input
            .insert_str(self.settings_cursor, text);
        self.settings_cursor += text.len();
    }

    fn delete_session_filter_back(&mut self) {
        if self.session_filter_cursor == 0 {
            return;
        }
        let remove_at = self.session_filter_cursor.saturating_sub(1);
        self.session_filter.remove(remove_at);
        self.session_filter_cursor = remove_at;
    }

    fn delete_session_filter_forward(&mut self) {
        if self.session_filter_cursor >= self.session_filter.len() {
            return;
        }
        self.session_filter.remove(self.session_filter_cursor);
    }

    fn delete_settings_input_back(&mut self) {
        if self.settings_cursor == 0 {
            return;
        }
        let remove_at = self.settings_cursor.saturating_sub(1);
        self.settings_input.remove(remove_at);
        self.settings_cursor = remove_at;
    }

    fn delete_settings_input_forward(&mut self) {
        if self.settings_cursor >= self.settings_input.len() {
            return;
        }
        self.settings_input.remove(self.settings_cursor);
    }

    fn clear_session_filter(&mut self) {
        self.session_filter.clear();
        self.session_filter_cursor = 0;
    }

    fn clear_settings_input(&mut self) {
        self.settings_input.clear();
        self.settings_cursor = 0;
    }

    fn open_settings(&mut self, mode: SettingsMode) {
        let current = match mode {
            SettingsMode::Model => self.model.clone().unwrap_or_default(),
            SettingsMode::Provider => self.provider.clone().unwrap_or_default(),
        };
        self.settings_mode = Some(mode);
        self.settings_input = current;
        self.settings_cursor = self.settings_input.len();
        self.pending_delete_session_id = None;
        self.filter_active = false;
    }

    fn refresh_git_changes(&mut self) {
        self.git_changes = Some(load_git_changes());
    }

    fn set_input(&mut self, text: String) {
        self.input = text;
        self.cursor = self.input.len();
    }

    fn record_history(&mut self, prompt: &str) {
        if prompt.trim().is_empty() {
            return;
        }
        if let Some(last) = self.input_history.last() {
            if last == prompt {
                return;
            }
        }
        self.input_history.push(prompt.to_string());
    }

    fn reset_chat_scroll(&mut self) {
        self.chat_scroll = 0;
        self.follow_tail = true;
        self.chat_unseen = false;
    }

    fn mark_chat_activity(&mut self) {
        if self.follow_tail {
            self.chat_unseen = false;
        } else {
            self.chat_unseen = true;
        }
    }

    fn history_up(&mut self) {
        if self.input_history.is_empty() {
            return;
        }
        match self.history_index {
            None => {
                self.history_draft = Some(self.input.clone());
                self.history_index = Some(self.input_history.len().saturating_sub(1));
            }
            Some(0) => {}
            Some(index) => {
                self.history_index = Some(index.saturating_sub(1));
            }
        }

        if let Some(index) = self.history_index {
            if let Some(entry) = self.input_history.get(index) {
                self.set_input(entry.clone());
            }
        }
    }

    fn history_down(&mut self) {
        let Some(index) = self.history_index else {
            return;
        };
        let next = index + 1;
        if next < self.input_history.len() {
            self.history_index = Some(next);
            if let Some(entry) = self.input_history.get(next) {
                self.set_input(entry.clone());
            }
            return;
        }
        self.history_index = None;
        let draft = self.history_draft.take().unwrap_or_default();
        self.set_input(draft);
    }
}

fn move_cursor_left(input: &str, cursor: usize) -> usize {
    if cursor == 0 {
        return 0;
    }
    let mut index = cursor.saturating_sub(1);
    while index > 0 && !input.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn move_cursor_right(input: &str, cursor: usize) -> usize {
    if cursor >= input.len() {
        return input.len();
    }
    let mut index = cursor + 1;
    while index < input.len() && !input.is_char_boundary(index) {
        index += 1;
    }
    index.min(input.len())
}

fn word_left(input: &str, cursor: usize) -> usize {
    let mut index = cursor;
    while let Some((start, ch)) = previous_char(input, index) {
        if !ch.is_whitespace() {
            index = start;
            break;
        }
        index = start;
    }
    while let Some((start, ch)) = previous_char(input, index) {
        if !is_word_char(ch) {
            break;
        }
        index = start;
    }
    index
}

fn word_right(input: &str, cursor: usize) -> usize {
    let mut index = cursor;
    while let Some((end, ch)) = next_char(input, index) {
        if !ch.is_whitespace() {
            index = end;
            break;
        }
        index = end;
    }
    while let Some((end, ch)) = next_char(input, index) {
        if !is_word_char(ch) {
            break;
        }
        index = end;
    }
    index
}

fn delete_prev_word(input: &mut String, cursor: usize) -> usize {
    let start = word_left(input, cursor);
    if start < cursor {
        input.replace_range(start..cursor, "");
    }
    start
}

fn delete_next_word(input: &mut String, cursor: usize) -> usize {
    let end = word_right(input, cursor);
    if end > cursor {
        input.replace_range(cursor..end, "");
    }
    cursor
}

fn delete_to_line_end(input: &mut String, cursor: usize) -> usize {
    let end = line_end(input, cursor);
    if end == cursor {
        if cursor < input.len() {
            return remove_next_char(input, cursor);
        }
        return cursor;
    }
    input.replace_range(cursor..end, "");
    cursor
}

fn remove_previous_char(input: &mut String, cursor: usize) -> usize {
    if cursor == 0 {
        return 0;
    }
    let start = move_cursor_left(input, cursor);
    if start < cursor {
        input.replace_range(start..cursor, "");
    }
    start
}

fn remove_next_char(input: &mut String, cursor: usize) -> usize {
    if cursor >= input.len() {
        return cursor;
    }
    let end = move_cursor_right(input, cursor);
    if end > cursor {
        input.replace_range(cursor..end, "");
    }
    cursor.min(input.len())
}

fn line_start(input: &str, cursor: usize) -> usize {
    let slice = &input[..cursor.min(input.len())];
    match slice.rfind('\n') {
        Some(pos) => pos + 1,
        None => 0,
    }
}

fn line_end(input: &str, cursor: usize) -> usize {
    let slice = &input[cursor.min(input.len())..];
    match slice.find('\n') {
        Some(pos) => cursor + pos,
        None => input.len(),
    }
}

fn previous_char(input: &str, cursor: usize) -> Option<(usize, char)> {
    if cursor == 0 {
        return None;
    }
    let mut index = cursor.saturating_sub(1);
    while index > 0 && !input.is_char_boundary(index) {
        index -= 1;
    }
    let ch = input[index..cursor].chars().next()?;
    Some((index, ch))
}

fn next_char(input: &str, cursor: usize) -> Option<(usize, char)> {
    if cursor >= input.len() {
        return None;
    }
    let ch = input[cursor..].chars().next()?;
    Some((cursor + ch.len_utf8(), ch))
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

fn chat_line_count(app: &App) -> usize {
    let width = app.chat_viewport_width.max(1);
    build_chat_lines(&app.messages, &app.streaming_text, width).len()
}

fn chat_max_scroll(app: &App) -> usize {
    let height = app.chat_viewport_height.max(1);
    chat_line_count(app).saturating_sub(height)
}

fn chat_scroll_step(app: &App) -> usize {
    let height = app.chat_viewport_height;
    if height > 1 {
        height.saturating_sub(1)
    } else {
        4
    }
}

fn main() -> Result<()> {
    let mut host = HostClient::spawn()?;
    let mut app = App::new();
    app.request_hello(&host)?;

    let _guard = TerminalGuard::enter()?;
    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend).context("init terminal")?;

    let result = run_app(&mut terminal, &mut app, &host);
    host.shutdown();
    result
}

fn run_app(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
    host: &HostClient,
) -> Result<()> {
    loop {
        handle_inbound(app, host)?;

        terminal.draw(|frame| draw_ui(frame, app))?;

        if app.should_exit {
            return Ok(());
        }

        if event::poll(Duration::from_millis(50))? {
            match event::read()? {
                Event::Key(key) => handle_key(app, host, key)?,
                Event::Paste(text) => handle_paste(app, text),
                _ => {}
            }
        }
    }
}

fn handle_inbound(app: &mut App, host: &HostClient) -> Result<()> {
    while let Ok(message) = host.rx.try_recv() {
        match message {
            InboundMessage::Message(WireMessage::Result {
                id,
                op,
                ok,
                payload,
                error,
            }) => {
                if op == "client.hello" && app.pending_hello.as_deref() == Some(id.as_str()) {
                    app.pending_hello = None;
                    if ok {
                        if let Some(caps) = payload
                            .and_then(|value| serde_json::from_value::<HostCapabilities>(value).ok())
                        {
                            app.host_caps = Some(caps);
                        }
                        app.status = "Connected.".to_string();
                        app.request_session_list(host)?;
                        if let Some(session_id) = app.session_override.clone() {
                            let _ = app.request_runtime_init(host, session_id);
                        }
                    } else {
                        app.status = error_message(error);
                    }
                } else if op == "session.list"
                    && app.pending_session_list.as_deref() == Some(id.as_str())
                {
                    app.pending_session_list = None;
                    app.loading_sessions = false;
                    app.pending_delete_session_id = None;
                    if ok {
                        if let Some(list) = payload.and_then(|value| value.get("sessions").cloned()) {
                            let parsed: Vec<SessionSummary> =
                                serde_json::from_value(list).unwrap_or_default();
                            app.sessions = parsed;
                            clamp_picker_selection(app);
                            if app.mode == AppMode::Picker {
                                app.selected = 0;
                                app.status = "Select a session.".to_string();
                            }
                        }
                    } else {
                        app.status = error_message(error);
                    }
                } else if op == "session.create"
                    && app.pending_session_create.as_deref() == Some(id.as_str())
                {
                    app.pending_session_create = None;
                    if ok {
                        if let Some(session) = payload.and_then(|value| value.get("session").cloned()) {
                            if let Ok(record) = serde_json::from_value::<SessionRecord>(session) {
                                app.request_runtime_init(host, record.id)?;
                            }
                        }
                    } else {
                        app.status = error_message(error);
                    }
                } else if op == "session.delete"
                    && app.pending_session_delete.as_deref() == Some(id.as_str())
                {
                    app.pending_session_delete = None;
                    app.pending_delete_session_id = None;
                    if ok {
                        let deleted_id = payload
                            .and_then(|value| value.get("sessionId").cloned())
                            .and_then(|value| value.as_str().map(|value| value.to_string()));
                        if let Some(deleted_id) = deleted_id {
                            app.sessions.retain(|session| session.id != deleted_id);
                            if app.sessions.is_empty() {
                                app.selected = 0;
                                app.status = "No sessions. Press n to create one.".to_string();
                            } else if app.selected >= app.sessions.len() {
                                app.selected = app.sessions.len().saturating_sub(1);
                                app.status = format!("Deleted session {deleted_id}.");
                            } else {
                                app.status = format!("Deleted session {deleted_id}.");
                            }
                        } else {
                            app.status = "Session deleted.".to_string();
                        }
                    } else {
                        app.status = error_message(error);
                    }
                } else if op == "runtime.init"
                    && app.pending_runtime_init.as_deref() == Some(id.as_str())
                {
                    app.pending_runtime_init = None;
                    app.pending_delete_session_id = None;
                    if ok {
                        if let Some(session) = payload.and_then(|value| value.get("session").cloned()) {
                            if let Ok(record) = serde_json::from_value::<SessionRecord>(session) {
                                app.mode = AppMode::Chat;
                                app.session_id = Some(record.id.clone());
                                app.session_title = Some(record.title.clone());
                                app.messages = record
                                    .messages
                                    .into_iter()
                                    .map(map_session_message)
                                    .collect();
                                app.streaming_text.clear();
                                app.reset_chat_scroll();
                                app.chat_unseen = false;
                                app.status = "Session loaded.".to_string();
                                app.refresh_git_changes();
                            }
                        }
                    } else {
                        app.status = error_message(error);
                        app.mode = AppMode::Picker;
                    }
                } else if op == "agent.prompt"
                    && app.pending_prompt.as_deref() == Some(id.as_str())
                {
                    app.pending_prompt = None;
                    app.streaming_text.clear();
                    if ok {
                        if let Some(text) = payload
                            .and_then(|value| value.get("assistantText").cloned())
                            .and_then(|value| value.as_str().map(|s| s.to_string()))
                        {
                            if !text.is_empty() {
                                app.push_assistant_message(text);
                            } else {
                                app.push_system_message("<no assistant response>");
                            }
                            app.status = "Done.".to_string();
                        }
                    } else {
                        app.status = error_message(error);
                        app.push_system_message(app.status.clone());
                    }
                    app.refresh_git_changes();
                } else if op == "agent.interrupt"
                    && app.pending_interrupt.as_deref() == Some(id.as_str())
                {
                    app.pending_interrupt = None;
                    if ok {
                        app.streaming_text.clear();
                        app.status = "Interrupted.".to_string();
                        app.push_system_message("Interrupt requested.");
                    } else {
                        app.status = error_message(error);
                    }
                } else if op == "approval.resolve"
                    && app.pending_approval_resolve.as_deref() == Some(id.as_str())
                {
                    app.pending_approval_resolve = None;
                    if ok {
                        app.pending_approval = None;
                        let status = payload
                            .as_ref()
                            .and_then(|value| value.get("status"))
                            .and_then(|value| value.as_str())
                            .unwrap_or("sent");
                        app.status = format!("Approval {status}.");
                    } else {
                        app.status = error_message(error);
                    }
                }
            }
            InboundMessage::Message(WireMessage::Event {
                event,
                request_id,
                payload,
            }) => {
                if let Some(active) = &app.pending_prompt {
                    if let Some(request) = request_id {
                        if &request != active {
                            continue;
                        }
                    }
                }
                handle_event(app, event, payload);
            }
            InboundMessage::Message(_) => {}
            InboundMessage::Error(message) => {
                app.status = message;
            }
            InboundMessage::HostExited => {
                app.status = "Host exited.".to_string();
                app.should_exit = true;
            }
        }
    }
    Ok(())
}

fn error_message(error: Option<WireError>) -> String {
    error
        .map(|err| err.message)
        .unwrap_or_else(|| "Request failed.".to_string())
}

fn handle_event(app: &mut App, event: String, payload: Option<Value>) {
    if event == "host.ready" {
        if app.host_caps.is_none() {
            if let Some(caps) = payload
                .and_then(|value| serde_json::from_value::<HostCapabilities>(value).ok())
            {
                app.host_caps = Some(caps);
            }
        }
        if app.pending_hello.is_none() {
            app.status = "Host ready.".to_string();
        }
        return;
    }

    if event == "runtime.context-file-stale" {
        if let Some(path) = payload
            .as_ref()
            .and_then(|value| value.get("path").or_else(|| value.get("absolutePath")))
            .and_then(|value| value.as_str())
        {
            app.push_system_message(format!("Stale file context detected: {path}"));
        } else {
            app.push_system_message("Stale file context detected.");
        }
        app.status = "Context stale.".to_string();
        return;
    }

    if event == "stream.chunk" {
        handle_stream_chunk(app, payload);
        return;
    }

    if event == "tool.calling" || event == "tool.result" {
        if let Some(message) = format_tool_event(&event, payload.as_ref()) {
            app.push_system_message(message.clone());
            app.status = message;
            return;
        }
    }

    if event == "approval.requested" {
        if let Some(pending) = parse_pending_approval(payload.as_ref()) {
            app.pending_approval = Some(pending);
            app.pending_approval_resolve = None;
        }
    } else if event == "approval.resolved" {
        if should_clear_pending_approval(app, payload.as_ref()) {
            app.pending_approval = None;
            app.pending_approval_resolve = None;
        }
    }

    if event == "approval.requested" || event == "approval.resolved" {
        if let Some(message) = format_approval_event(&event, payload.as_ref()) {
            app.push_system_message(message.clone());
            if event == "approval.requested" {
                if let Some(pending) = app.pending_approval.as_ref() {
                    app.status = approval_prompt(pending);
                } else {
                    app.status = message;
                }
            } else {
                app.status = message;
            }
            return;
        }
    }

    if event.starts_with("agent.") {
        if should_ignore_agent_event(app, &event) {
            return;
        }
        if let Some(message) = format_agent_event(&event, payload.as_ref()) {
            app.push_system_message(message.clone());
            app.status = message;
            return;
        }
    }

    app.status = format!("Event: {event}");
}

fn format_agent_event(event: &str, payload: Option<&Value>) -> Option<String> {
    if event.ends_with("tool:calling") {
        return format_tool_event("tool.calling", payload);
    }
    if event.ends_with("tool:result") {
        return format_tool_event("tool.result", payload);
    }
    if event.ends_with("confirmation:required") {
        return format_approval_event("approval.requested", payload);
    }
    if event.ends_with("confirmation:received") {
        return format_approval_event("approval.resolved", payload);
    }
    let data = payload?.get("data")?;
    if event.ends_with("plan:created") {
        return Some("Plan created.".to_string());
    }
    if event.ends_with("plan:approved") {
        return Some("Plan approved.".to_string());
    }
    if event.ends_with("plan:rejected") {
        return Some("Plan rejected.".to_string());
    }
    if event.ends_with("error") {
        if let Some(error) = data.get("error").and_then(|value| value.as_str()) {
            return Some(format!("Error: {error}"));
        }
        return Some("Agent error.".to_string());
    }
    None
}

fn format_tool_event(event: &str, payload: Option<&Value>) -> Option<String> {
    let data = payload?.get("data")?;
    if event == "tool.calling" {
        let tool = data.get("toolName")?.as_str().unwrap_or("unknown");
        let args = data
            .get("arguments")
            .map(|value| value.to_string())
            .unwrap_or_else(|| "{}".to_string());
        return Some(format!("Tool call: {tool} {args}"));
    }
    if event == "tool.result" {
        let tool = data.get("toolName")?.as_str().unwrap_or("unknown");
        let success = data
            .get("result")
            .and_then(|value| value.get("success"))
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        let status = if success { "ok" } else { "failed" };
        return Some(format!("Tool result: {tool} {status}"));
    }
    None
}

fn format_approval_event(event: &str, payload: Option<&Value>) -> Option<String> {
    let data = payload?.get("data")?;
    if event == "approval.requested" {
        let tool = data.get("toolName")?.as_str().unwrap_or("unknown");
        let risk = data
            .get("risk")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let reason = data
            .get("reason")
            .and_then(|value| value.as_str())
            .or_else(|| data.get("description").and_then(|value| value.as_str()))
            .unwrap_or("");
        let args = data
            .get("arguments")
            .map(|value| value.to_string())
            .unwrap_or_else(|| "{}".to_string());

        let mut message = format!("Approval required: {tool}");
        if !risk.is_empty() {
            message.push_str(&format!(" ({risk})"));
        }

        let mut details = Vec::new();
        if !reason.is_empty() {
            details.push(format!("Reason: {reason}"));
        }
        if args != "{}" {
            details.push(format!("Args: {args}"));
        }

        if details.is_empty() {
            return Some(message);
        }
        return Some(format!("{message} — {}", details.join(" | ")));
    }
    if event == "approval.resolved" {
        let status = data
            .get("status")
            .and_then(|value| value.as_str())
            .or_else(|| {
                data.get("confirmed")
                    .and_then(|value| value.as_bool())
                    .map(|approved| if approved { "approved" } else { "rejected" })
            })
            .unwrap_or("resolved");
        return Some(format!("Approval {status}."));
    }
    None
}

fn parse_pending_approval(payload: Option<&Value>) -> Option<PendingApproval> {
    let payload = payload?;
    let data = payload.get("data")?;
    let tool_name = data
        .get("toolName")
        .and_then(|value| value.as_str())
        .unwrap_or("unknown")
        .to_string();
    let risk = data
        .get("risk")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let reason = data
        .get("reason")
        .and_then(|value| value.as_str())
        .or_else(|| data.get("description").and_then(|value| value.as_str()))
        .map(|value| value.to_string());
    let arguments = data
        .get("arguments")
        .map(|value| value.to_string())
        .filter(|value| value != "{}");
    let approval_id = data
        .get("approvalId")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            payload
                .get("timestamp")
                .and_then(|value| value.as_i64())
                .map(|timestamp| format!("approval_{timestamp}"))
        })?;

    Some(PendingApproval {
        id: approval_id,
        tool_name,
        risk,
        reason,
        arguments,
    })
}

fn should_clear_pending_approval(app: &App, payload: Option<&Value>) -> bool {
    let pending = match app.pending_approval.as_ref() {
        Some(value) => value,
        None => return false,
    };
    if let Some(approval_id) = payload
        .and_then(|value| value.get("data"))
        .and_then(|value| value.get("approvalId"))
        .and_then(|value| value.as_str())
    {
        return approval_id == pending.id;
    }
    true
}

fn approval_prompt(approval: &PendingApproval) -> String {
    let mut message = format!("Approval required: {}", approval.tool_name);
    if let Some(risk) = &approval.risk {
        message.push_str(&format!(" ({risk})"));
    }
    if let Some(reason) = &approval.reason {
        message.push_str(&format!(" — {reason}"));
    }
    message.push_str(". Press y to approve, n to reject.");
    message
}

fn should_ignore_agent_event(app: &App, event: &str) -> bool {
    if host_supports(app, "tool-events")
        && (event.ends_with("tool:calling") || event.ends_with("tool:result"))
    {
        return true;
    }
    if host_supports(app, "approval-events")
        && (event.ends_with("confirmation:required") || event.ends_with("confirmation:received"))
    {
        return true;
    }
    false
}

fn host_supports(app: &App, feature: &str) -> bool {
    app.host_caps
        .as_ref()
        .map(|caps| caps.features.iter().any(|item| item == feature))
        .unwrap_or(false)
}

fn host_supports_op(app: &App, op: &str) -> bool {
    app.host_caps
        .as_ref()
        .map(|caps| caps.ops.iter().any(|item| item == op))
        .unwrap_or(false)
}

fn handle_stream_chunk(app: &mut App, payload: Option<Value>) {
    let Some(payload) = payload else {
        return;
    };
    let chunk_value = match payload.get("chunk") {
        Some(value) => value.clone(),
        None => payload,
    };
    let Ok(chunk) = serde_json::from_value::<StreamChunk>(chunk_value) else {
        return;
    };

    match chunk.chunk_type.as_str() {
        "text" => {
            if let Ok(data) = serde_json::from_value::<StreamTextData>(chunk.data) {
                if data.content.is_empty() {
                    return;
                }
                if app.streaming_text.is_empty() {
                    app.status = "Streaming...".to_string();
                }
                app.streaming_text.push_str(&data.content);
                if !app.follow_tail {
                    app.chat_unseen = true;
                }
            }
        }
        "thinking" => {
            app.status = "Thinking...".to_string();
        }
        "progress" => {
            if let Ok(data) = serde_json::from_value::<StreamProgressData>(chunk.data) {
                let mut status = if !data.message.is_empty() {
                    data.message
                } else if !data.stage.is_empty() {
                    data.stage
                } else {
                    "Progress update".to_string()
                };
                if let Some(percent) = data.percent {
                    let normalized = if percent <= 1.0 { percent * 100.0 } else { percent };
                    status = format!("{status} ({}%)", normalized.round() as i64);
                }
                app.status = status;
            }
        }
        "error" => {
            if let Ok(data) = serde_json::from_value::<StreamErrorData>(chunk.data) {
                let message = if data.message.is_empty() {
                    "Stream error.".to_string()
                } else {
                    data.message
                };
                let decorated = if let Some(code) = data.code {
                    format!("{message} ({code})")
                } else {
                    message
                };
                app.status = decorated.clone();
                app.push_system_message(decorated);
            }
        }
        "done" => {
            app.streaming_text.clear();
        }
        _ => {}
    }
}

fn map_session_message(message: SessionMessage) -> ChatMessage {
    let role = match message.role.as_str() {
        "assistant" => MessageRole::Assistant,
        "user" => MessageRole::User,
        _ => MessageRole::System,
    };
    ChatMessage {
        role,
        content: message.content,
    }
}

fn handle_key(app: &mut App, host: &HostClient, key: KeyEvent) -> Result<()> {
    if app.show_help {
        if key.code == KeyCode::F(1)
            || key.code == KeyCode::Esc
            || key.code == KeyCode::Char('q')
            || key.code == KeyCode::Char('?')
        {
            app.show_help = false;
        }
        return Ok(());
    }

    if key.code == KeyCode::F(1)
        || (app.mode == AppMode::Picker && key.code == KeyCode::Char('?'))
    {
        app.show_help = true;
        return Ok(());
    }

    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
        if app.pending_prompt.is_some() {
            app.request_interrupt(host)?;
        } else {
            app.should_exit = true;
        }
        return Ok(());
    }

    match app.mode {
        AppMode::Picker => handle_picker_key(app, host, key),
        AppMode::Chat => handle_chat_key(app, host, key),
    }
}

fn handle_paste(app: &mut App, text: String) {
    if app.mode != AppMode::Chat {
        return;
    }
    let sanitized = sanitize_paste_text(&text);
    app.paste_burst.reset();
    app.insert_input(&sanitized);
}

fn sanitize_paste_text(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn handle_picker_key(app: &mut App, host: &HostClient, key: KeyEvent) -> Result<()> {
    if let Some(mode) = app.settings_mode {
        let is_plain_char = matches!(key.code, KeyCode::Char(_))
            && !key.modifiers.contains(KeyModifiers::CONTROL)
            && !key.modifiers.contains(KeyModifiers::ALT);
        match key.code {
            KeyCode::Esc => {
                app.settings_mode = None;
                app.status = "Settings canceled.".to_string();
                return Ok(());
            }
            KeyCode::Enter => {
                let value = app.settings_input.trim();
                let normalized = if value.is_empty() || value.eq_ignore_ascii_case("auto") {
                    None
                } else {
                    Some(value.to_string())
                };
                match mode {
                    SettingsMode::Model => {
                        app.model = normalized.clone();
                        let mut status = match &app.model {
                            Some(model) => format!("Model set to {model}."),
                            None => "Model reset to auto.".to_string(),
                        };
                        if let Err(error) = save_cli_config_value("model", app.model.clone()) {
                            status = format!("Failed to save model: {error}");
                        }
                        app.status = status;
                    }
                    SettingsMode::Provider => {
                        app.provider = normalized.clone();
                        let mut status = match &app.provider {
                            Some(provider) => format!("Provider set to {provider}."),
                            None => "Provider reset to auto.".to_string(),
                        };
                        if let Err(error) = save_cli_config_value("provider", app.provider.clone()) {
                            status = format!("Failed to save provider: {error}");
                        }
                        app.status = status;
                    }
                }
                app.settings_mode = None;
                return Ok(());
            }
            KeyCode::Backspace => {
                app.delete_settings_input_back();
                return Ok(());
            }
            KeyCode::Delete => {
                app.delete_settings_input_forward();
                return Ok(());
            }
            KeyCode::Left => {
                app.settings_cursor = app.settings_cursor.saturating_sub(1);
                return Ok(());
            }
            KeyCode::Right => {
                if app.settings_cursor < app.settings_input.len() {
                    app.settings_cursor += 1;
                }
                return Ok(());
            }
            KeyCode::Home => {
                app.settings_cursor = 0;
                return Ok(());
            }
            KeyCode::End => {
                app.settings_cursor = app.settings_input.len();
                return Ok(());
            }
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                app.clear_settings_input();
                return Ok(());
            }
            _ if is_plain_char => {
                if let KeyCode::Char(ch) = key.code {
                    app.insert_settings_input(&ch.to_string());
                }
                return Ok(());
            }
            _ => {}
        }
    }

    if let Some(pending_id) = app.pending_delete_session_id.clone() {
        match key.code {
            KeyCode::Char('y') | KeyCode::Char('Y') => {
                app.pending_delete_session_id = None;
                app.request_session_delete(host, pending_id)?;
                return Ok(());
            }
            KeyCode::Char('n') | KeyCode::Char('N') => {
                app.pending_delete_session_id = None;
                app.status = "Delete canceled.".to_string();
                return Ok(());
            }
            KeyCode::Char('d') | KeyCode::Char('D') => {}
            _ => {
                app.pending_delete_session_id = None;
            }
        }
    }

    if app.filter_active {
        let is_plain_char = matches!(key.code, KeyCode::Char(_))
            && !key.modifiers.contains(KeyModifiers::CONTROL)
            && !key.modifiers.contains(KeyModifiers::ALT);
        match key.code {
            KeyCode::Esc => {
                app.filter_active = false;
                app.session_filter_cursor = app.session_filter.len();
                app.status = "Filter closed.".to_string();
                return Ok(());
            }
            KeyCode::Backspace => {
                app.delete_session_filter_back();
                app.pending_delete_session_id = None;
                clamp_picker_selection(app);
                return Ok(());
            }
            KeyCode::Delete => {
                app.delete_session_filter_forward();
                app.pending_delete_session_id = None;
                clamp_picker_selection(app);
                return Ok(());
            }
            KeyCode::Left => {
                app.session_filter_cursor = app.session_filter_cursor.saturating_sub(1);
                return Ok(());
            }
            KeyCode::Right => {
                if app.session_filter_cursor < app.session_filter.len() {
                    app.session_filter_cursor += 1;
                }
                return Ok(());
            }
            KeyCode::Home => {
                app.session_filter_cursor = 0;
                return Ok(());
            }
            KeyCode::End => {
                app.session_filter_cursor = app.session_filter.len();
                return Ok(());
            }
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                app.clear_session_filter();
                app.pending_delete_session_id = None;
                clamp_picker_selection(app);
                return Ok(());
            }
            _ if is_plain_char => {
                if let KeyCode::Char(ch) = key.code {
                    app.insert_session_filter(&ch.to_string());
                    app.pending_delete_session_id = None;
                    clamp_picker_selection(app);
                }
                return Ok(());
            }
            _ => {}
        }
    }

    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => app.should_exit = true,
        KeyCode::Up => {
            let filtered_len = filtered_session_indices(app).len();
            if filtered_len > 0 && app.selected > 0 {
                app.selected -= 1;
                app.pending_delete_session_id = None;
            }
        }
        KeyCode::Down => {
            let filtered_len = filtered_session_indices(app).len();
            if app.selected + 1 < filtered_len {
                app.selected += 1;
                app.pending_delete_session_id = None;
            }
        }
        KeyCode::Enter => {
            let filtered = filtered_session_indices(app);
            if let Some(index) = filtered.get(app.selected) {
                if let Some(session) = app.sessions.get(*index) {
                    app.pending_delete_session_id = None;
                    app.filter_active = false;
                    app.request_runtime_init(host, session.id.clone())?;
                }
            }
        }
        KeyCode::Char('/') => {
            app.filter_active = true;
            app.session_filter_cursor = app.session_filter.len();
            app.pending_delete_session_id = None;
            app.status = "Filter sessions. Type to search.".to_string();
        }
        KeyCode::Char('m') | KeyCode::Char('M') => {
            app.open_settings(SettingsMode::Model);
            app.status = "Edit model. Enter to save, Esc to cancel.".to_string();
        }
        KeyCode::Char('p') | KeyCode::Char('P') => {
            app.open_settings(SettingsMode::Provider);
            app.status = "Edit provider. Enter to save, Esc to cancel.".to_string();
        }
        KeyCode::Char('n') => {
            app.pending_delete_session_id = None;
            app.request_session_create(host)?;
        }
        KeyCode::Char('d') | KeyCode::Char('D') => {
            if !host_supports_op(app, "session.delete") {
                app.status = "Session deletion not supported by host.".to_string();
                return Ok(());
            }
            let filtered = filtered_session_indices(app);
            if let Some(index) = filtered.get(app.selected) {
                if let Some(session) = app.sessions.get(*index) {
                    app.pending_delete_session_id = Some(session.id.clone());
                    app.status = format!(
                        "Delete session {}? Press y to confirm, n to cancel.",
                        session.id
                    );
                }
            }
        }
        KeyCode::Char('r') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.pending_delete_session_id = None;
            app.request_session_list(host)?;
        }
        _ => {}
    }
    Ok(())
}

fn handle_chat_key(app: &mut App, host: &HostClient, key: KeyEvent) -> Result<()> {
    let now = Instant::now();
    app.paste_burst.clear_if_idle(now);

    if app.pending_approval.is_some()
        && !key.modifiers.contains(KeyModifiers::CONTROL)
        && !key.modifiers.contains(KeyModifiers::ALT)
    {
        match key.code {
            KeyCode::Char('y') | KeyCode::Char('Y') => {
                app.request_approval_resolve(host, true)?;
                return Ok(());
            }
            KeyCode::Char('n') | KeyCode::Char('N') => {
                app.request_approval_resolve(host, false)?;
                return Ok(());
            }
            _ => {}
        }
    }

    let is_plain_char = matches!(key.code, KeyCode::Char(_))
        && !key.modifiers.contains(KeyModifiers::CONTROL)
        && !key.modifiers.contains(KeyModifiers::ALT);
    if is_plain_char {
        app.paste_burst.note_plain_char(now);
    } else if !matches!(key.code, KeyCode::Enter) {
        app.paste_burst.reset();
    }

    match key.code {
        KeyCode::Esc => {
            app.mode = AppMode::Picker;
            app.filter_active = false;
            app.session_filter_cursor = app.session_filter.len();
            app.pending_delete_session_id = None;
            app.request_session_list(host)?;
        }
        KeyCode::Up => {
            app.history_up();
        }
        KeyCode::Down => {
            app.history_down();
        }
        KeyCode::PageUp => {
            let step = chat_scroll_step(app);
            app.chat_scroll = app.chat_scroll.saturating_sub(step);
            app.follow_tail = false;
        }
        KeyCode::PageDown => {
            let step = chat_scroll_step(app);
            let max_scroll = chat_max_scroll(app);
            app.chat_scroll = (app.chat_scroll + step).min(max_scroll);
            app.follow_tail = app.chat_scroll >= max_scroll;
            if app.follow_tail {
                app.chat_unseen = false;
            }
        }
        KeyCode::Char('g') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.refresh_git_changes();
            let status = app
                .git_changes
                .as_ref()
                .and_then(|changes| changes.error.as_ref())
                .map(|error| format!("Git refresh failed: {error}"))
                .unwrap_or_else(|| "Changes refreshed.".to_string());
            app.status = status;
        }
        KeyCode::Char('o') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let result = open_first_changed_file(app);
            app.status = match result {
                Ok(message) => message,
                Err(error) => format!("Open failed: {error}"),
            };
        }
        KeyCode::Home if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.chat_scroll = 0;
            app.follow_tail = false;
        }
        KeyCode::End if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.chat_scroll = chat_max_scroll(app);
            app.follow_tail = true;
            app.chat_unseen = false;
        }
        KeyCode::F(2) => {
            app.chat_scroll = chat_max_scroll(app);
            app.follow_tail = true;
            app.chat_unseen = false;
        }
        KeyCode::Char('a') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = line_start(&app.input, app.cursor);
        }
        KeyCode::Char('e') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = line_end(&app.input, app.cursor);
        }
        KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = delete_to_line_end(&mut app.input, app.cursor);
        }
        KeyCode::Char('w') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = delete_prev_word(&mut app.input, app.cursor);
        }
        KeyCode::Enter => {
            if key.modifiers.contains(KeyModifiers::SHIFT) {
                app.insert_input("\n");
                app.paste_burst.reset();
                return Ok(());
            }
            if app.paste_burst.is_active(now) {
                app.insert_input("\n");
                app.paste_burst.extend(now);
                return Ok(());
            }
            let trimmed = app.input.trim_end();
            if trimmed.trim().is_empty() {
                return Ok(());
            }
            if app.pending_prompt.is_some() {
                app.status = "Agent is busy.".to_string();
                return Ok(());
            }
            let prompt = trimmed.to_string();
            app.input.clear();
            app.cursor = 0;
            app.history_index = None;
            app.history_draft = None;
            app.reset_chat_scroll();
            app.record_history(&prompt);
            app.push_user_message(prompt.clone());
            app.request_prompt(host, prompt)?;
        }
        KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.mode = AppMode::Picker;
            app.filter_active = false;
            app.session_filter_cursor = app.session_filter.len();
            app.pending_delete_session_id = None;
            app.request_session_list(host)?;
        }
        KeyCode::Left => {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                app.cursor = word_left(&app.input, app.cursor);
            } else {
                app.cursor = move_cursor_left(&app.input, app.cursor);
            }
        }
        KeyCode::Right => {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                app.cursor = word_right(&app.input, app.cursor);
            } else {
                app.cursor = move_cursor_right(&app.input, app.cursor);
            }
        }
        KeyCode::Home => app.cursor = line_start(&app.input, app.cursor),
        KeyCode::End => app.cursor = line_end(&app.input, app.cursor),
        KeyCode::Backspace => {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                app.cursor = delete_prev_word(&mut app.input, app.cursor);
            } else {
                let new_cursor = remove_previous_char(&mut app.input, app.cursor);
                app.cursor = new_cursor;
            }
        }
        KeyCode::Delete => {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                app.cursor = delete_next_word(&mut app.input, app.cursor);
            } else {
                let new_cursor = remove_next_char(&mut app.input, app.cursor);
                app.cursor = new_cursor;
            }
        }
        KeyCode::Tab => {
            app.insert_input(&" ".repeat(TAB_WIDTH));
        }
        KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.input.clear();
            app.cursor = 0;
        }
        KeyCode::Char(ch) => {
            if key.modifiers.contains(KeyModifiers::CONTROL)
                || key.modifiers.contains(KeyModifiers::ALT)
            {
                return Ok(());
            }
            app.input.insert(app.cursor, ch);
            app.cursor += ch.len_utf8();
        }
        _ => {}
    }
    Ok(())
}

fn draw_ui(frame: &mut ratatui::Frame, app: &mut App) {
    let input_height = desired_input_height(app, frame.size());
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(1),
            Constraint::Length(input_height),
        ])
        .split(frame.size());

    let header = Paragraph::new(app_header(app))
        .style(Style::default().fg(Color::Cyan))
        .wrap(Wrap { trim: true });
    frame.render_widget(header, chunks[0]);

    app.chat_viewport_height = chunks[1].height.saturating_sub(2) as usize;
    app.chat_viewport_width = chunks[1].width.saturating_sub(2) as usize;

    match app.mode {
        AppMode::Picker => draw_picker(frame, app, chunks[1]),
        AppMode::Chat => draw_chat_with_sidebar(frame, app, chunks[1]),
    }

    draw_input(frame, app, chunks[2]);

    if app.show_help {
        draw_help(frame, app);
    }
    if let Some(pending) = app.pending_approval.as_ref() {
        draw_approval_dialog(frame, pending);
    }
    if let Some(mode) = app.settings_mode {
        draw_settings_dialog(frame, app, mode);
    }
}

fn app_header(app: &App) -> Text<'_> {
    let session = match (&app.session_id, &app.session_title) {
        (Some(id), Some(title)) if !title.is_empty() => format!("Session: {id} ({title})"),
        (Some(id), _) => format!("Session: {id}"),
        _ => "Session: <none>".to_string(),
    };
    let proto = app
        .host_caps
        .as_ref()
        .map(|caps| format!("v{}", caps.protocol_version))
        .unwrap_or_else(|| "v?".to_string());
    let scroll_hint = if app.mode == AppMode::Chat {
        if app.chat_unseen {
            " | New"
        } else if !app.follow_tail {
            " | Scroll"
        } else {
            ""
        }
    } else {
        ""
    };
    Text::from(vec![Line::from(format!(
        "Keep-Up TUI {proto} | {session} | {}{scroll_hint}",
        app.status
    ))])
}

fn draw_picker(frame: &mut ratatui::Frame, app: &App, area: Rect) {
    let title = if app.loading_sessions {
        "Sessions (loading...)"
    } else {
        "Sessions"
    };
    let block = Block::default().title(title).borders(Borders::ALL);

    let filtered = filtered_session_indices(app);
    if filtered.is_empty() && !app.loading_sessions {
        let message = if app.session_filter.trim().is_empty() {
            "No sessions. Press n to create one."
        } else {
            "No sessions match the filter."
        };
        let empty = Paragraph::new(message).block(block);
        frame.render_widget(empty, area);
        return;
    }

    let items: Vec<ListItem> = filtered
        .iter()
        .filter_map(|index| app.sessions.get(*index))
        .map(|session| {
            let title = if session.title.is_empty() {
                "(untitled)"
            } else {
                session.title.as_str()
            };
            let pending_delete = app
                .pending_delete_session_id
                .as_deref()
                .is_some_and(|id| id == session.id);
            let label = format!(
                "{} - {} ({} messages, {} tools, {} approvals){}",
                session.id,
                title,
                session.message_count,
                session.tool_call_count,
                session.approval_count,
                if pending_delete { " [delete?]" } else { "" }
            );
            let mut item = ListItem::new(label);
            if pending_delete {
                item = item.style(Style::default().fg(Color::Red));
            }
            item
        })
        .collect();

    let list = List::new(items)
        .block(block)
        .highlight_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    let selected = if filtered.is_empty() {
        0
    } else {
        app.selected.min(filtered.len().saturating_sub(1))
    };
    frame.render_stateful_widget(list, area, &mut list_state(selected));
}

fn filtered_session_indices(app: &App) -> Vec<usize> {
    let query = app.session_filter.trim().to_lowercase();
    if query.is_empty() {
        return (0..app.sessions.len()).collect();
    }
    app.sessions
        .iter()
        .enumerate()
        .filter_map(|(index, session)| {
            let haystack_id = session.id.to_lowercase();
            let haystack_title = session.title.to_lowercase();
            if haystack_id.contains(&query) || haystack_title.contains(&query) {
                Some(index)
            } else {
                None
            }
        })
        .collect()
}

fn clamp_picker_selection(app: &mut App) {
    let filtered = filtered_session_indices(app);
    if filtered.is_empty() {
        app.selected = 0;
        return;
    }
    if app.selected >= filtered.len() {
        app.selected = filtered.len().saturating_sub(1);
    }
}

fn draw_chat(frame: &mut ratatui::Frame, app: &mut App, area: Rect) {
    let block = Block::default().title("Conversation").borders(Borders::ALL);
    let width = app.chat_viewport_width.max(1);
    let lines = build_chat_lines(&app.messages, &app.streaming_text, width);
    let visible_height = area.height.saturating_sub(2) as usize;
    let max_scroll = lines.len().saturating_sub(visible_height);
    if app.follow_tail {
        app.chat_scroll = max_scroll;
    } else if app.chat_scroll > max_scroll {
        app.chat_scroll = max_scroll;
    }
    if app.follow_tail {
        app.chat_unseen = false;
    }

    let scroll = app.chat_scroll.min(u16::MAX as usize) as u16;
    let paragraph = Paragraph::new(Text::from(lines))
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));

    frame.render_widget(paragraph, area);

    if (!app.follow_tail || app.chat_unseen) && area.width > 4 && area.height > 2 {
        let label = if app.chat_unseen {
            "New messages (F2)"
        } else {
            "Scroll (F2)"
        };
        draw_chat_indicator(frame, area, label);
    }
}

fn draw_chat_with_sidebar(frame: &mut ratatui::Frame, app: &mut App, area: Rect) {
    if area.width < 80 {
        draw_chat(frame, app, area);
        return;
    }

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(68), Constraint::Percentage(32)])
        .split(area);

    draw_chat(frame, app, chunks[0]);
    draw_changes_panel(frame, app, chunks[1]);
}

fn draw_changes_panel(frame: &mut ratatui::Frame, app: &App, area: Rect) {
    let block = Block::default().title("Changes").borders(Borders::ALL);

    let mut lines = Vec::new();
    match app.git_changes.as_ref() {
        None => {
            lines.push(Line::from("Press Ctrl+G to refresh changes."));
        }
        Some(changes) => {
            if let Some(error) = &changes.error {
                lines.push(Line::from(format!("Git error: {error}")));
            } else {
                lines.push(Line::from(changes.summary.clone()));
                lines.push(Line::from("Ctrl+O to open first change"));
                if !changes.files.is_empty() {
                    lines.push(Line::from(""));
                    for file in &changes.files {
                        if file.status.is_empty() {
                            lines.push(Line::from(file.path.clone()));
                        } else {
                            lines.push(Line::from(format!("{} {}", file.status, file.path)));
                        }
                    }
                }
            }
        }
    }

    let paragraph = Paragraph::new(lines)
        .block(block)
        .wrap(Wrap { trim: true });
    frame.render_widget(paragraph, area);
}

fn draw_input(frame: &mut ratatui::Frame, app: &App, area: Rect) {
    if matches!(app.mode, AppMode::Picker) {
        if !app.filter_active && app.session_filter.trim().is_empty() {
            let block = Block::default().title("Filter").borders(Borders::ALL);
            let hint = Paragraph::new("Press / to filter sessions.")
                .block(block)
                .style(Style::default().add_modifier(Modifier::DIM))
                .wrap(Wrap { trim: true });
            frame.render_widget(hint, area);
            return;
        }

        let block = Block::default().title("Filter").borders(Borders::ALL);
        let inner_width = area.width.saturating_sub(2) as usize;
        let available = inner_width
            .saturating_sub(display_width(FILTER_PREFIX))
            .max(1);
        let layout = build_filter_layout(
            &app.session_filter,
            app.session_filter_cursor,
            available,
        );
        let visible_height = area.height.saturating_sub(2) as usize;
        let scroll_offset = compute_input_scroll(layout.cursor_line, visible_height);
        let scroll = scroll_offset.min(u16::MAX as usize) as u16;
        let paragraph = Paragraph::new(Text::from(layout.lines))
            .block(block)
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0));
        frame.render_widget(paragraph, area);

        if app.filter_active {
            let cursor_line = layout.cursor_line.saturating_sub(scroll_offset);
            if cursor_line < visible_height {
                let cursor_x =
                    area.x + 1 + display_width(FILTER_PREFIX) as u16 + layout.cursor_col as u16;
                let max_x = area.x + area.width.saturating_sub(2);
                let cursor_y = area.y + 1 + cursor_line as u16;
                frame.set_cursor(cursor_x.min(max_x), cursor_y);
            }
        }
        return;
    }

    let block = Block::default().title("Input").borders(Borders::ALL);
    let inner_width = area.width.saturating_sub(2) as usize;
    let available = inner_width
        .saturating_sub(display_width(INPUT_PREFIX))
        .max(1);
    let layout = build_input_layout(&app.input, app.cursor, available);
    let visible_height = area.height.saturating_sub(2) as usize;
    let scroll_offset = compute_input_scroll(layout.cursor_line, visible_height);
    let scroll = scroll_offset.min(u16::MAX as usize) as u16;
    let paragraph = Paragraph::new(Text::from(layout.lines))
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));
    frame.render_widget(paragraph, area);

    let cursor_line = layout.cursor_line.saturating_sub(scroll_offset);
    if cursor_line < visible_height {
        let cursor_x =
            area.x + 1 + display_width(INPUT_PREFIX) as u16 + layout.cursor_col as u16;
        let max_x = area.x + area.width.saturating_sub(2);
        let cursor_y = area.y + 1 + cursor_line as u16;
        frame.set_cursor(cursor_x.min(max_x), cursor_y);
    }
}

fn build_chat_lines(
    messages: &[ChatMessage],
    streaming_text: &str,
    width: usize,
) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    for message in messages {
        let (prefix, style) = match message.role {
            MessageRole::User => ("You: ", Style::default().fg(Color::Green)),
            MessageRole::Assistant => ("AI: ", Style::default().fg(Color::Cyan)),
            MessageRole::System => ("", Style::default().add_modifier(Modifier::DIM)),
        };
        append_message_lines(&mut lines, prefix, style, &message.content, width);
    }

    if !streaming_text.is_empty() {
        let style = Style::default().fg(Color::Cyan).add_modifier(Modifier::DIM);
        append_message_lines(&mut lines, "AI~: ", style, streaming_text, width);
    }

    if lines.is_empty() {
        lines.push(Line::from("No messages yet."));
    }
    lines
}

fn append_message_lines(
    lines: &mut Vec<Line<'static>>,
    prefix: &str,
    style: Style,
    content: &str,
    width: usize,
) {
    let indent = " ".repeat(display_width(prefix));
    let mut first_line = true;

    for raw_line in content.split('\n') {
        let prefix_width = display_width(prefix);
        let indent_width = display_width(&indent);
        let available_first = width.saturating_sub(prefix_width).max(1);
        let available_next = width.saturating_sub(indent_width).max(1);

        let segments = wrap_line_by_width(raw_line, available_first, available_next);
        for segment in segments {
            let use_prefix = first_line;
            let prefix_text = if use_prefix { prefix } else { &indent };
            let prefix_style = if use_prefix {
                style.add_modifier(Modifier::BOLD)
            } else {
                style
            };
            lines.push(Line::from(vec![
                Span::styled(prefix_text.to_string(), prefix_style),
                Span::styled(segment, style),
            ]));
            first_line = false;
        }
    }
    lines.push(Line::from(""));
}

struct InputLayout {
    lines: Vec<Line<'static>>,
    cursor_line: usize,
    cursor_col: usize,
}

fn desired_input_height(app: &App, area: Rect) -> u16 {
    let inner_width = area.width.saturating_sub(2) as usize;
    let (content, prefix) = if matches!(app.mode, AppMode::Picker) {
        (app.session_filter.as_str(), FILTER_PREFIX)
    } else {
        (app.input.as_str(), INPUT_PREFIX)
    };
    let available = inner_width.saturating_sub(display_width(prefix)).max(1);
    let line_count = count_wrapped_lines(content, available);
    let desired = (line_count + 2) as u16;
    let max_by_frame = area.height.saturating_sub(2);
    let max_height = std::cmp::min(MAX_INPUT_HEIGHT, max_by_frame);
    let min_height = std::cmp::min(MIN_INPUT_HEIGHT, max_height);
    desired.clamp(min_height, max_height)
}

fn count_wrapped_lines(input: &str, available: usize) -> usize {
    if available == 0 {
        return 1;
    }
    let mut total = 0;
    for line in input.split('\n') {
        total += wrap_line_by_width(line, available, available).len();
    }
    total.max(1)
}

fn build_input_layout(input: &str, cursor: usize, available: usize) -> InputLayout {
    build_prefixed_layout(input, cursor, available, INPUT_PREFIX, INPUT_INDENT)
}

fn build_filter_layout(input: &str, cursor: usize, available: usize) -> InputLayout {
    build_prefixed_layout(input, cursor, available, FILTER_PREFIX, FILTER_INDENT)
}

fn build_prefixed_layout(
    input: &str,
    cursor: usize,
    available: usize,
    prefix: &str,
    indent: &str,
) -> InputLayout {
    let available = available.max(1);
    let mut lines = Vec::new();
    let mut first = true;
    for line in input.split('\n') {
        let segments = wrap_line_by_width(line, available, available);
        for segment in segments {
            let prefix = if first { prefix } else { indent };
            lines.push(Line::from(format!("{prefix}{segment}")));
            first = false;
        }
    }

    let (cursor_line, cursor_col) = compute_cursor_position(input, cursor, available);
    InputLayout {
        lines,
        cursor_line,
        cursor_col,
    }
}

fn compute_cursor_position(input: &str, cursor: usize, available: usize) -> (usize, usize) {
    let available = available.max(1);
    let mut cursor_line = 0;
    let mut cursor_col = 0;
    let mut last_break = 0;

    for (byte_index, ch) in input.char_indices() {
        if byte_index >= cursor {
            break;
        }
        if ch == '\n' {
            cursor_line += 1;
            last_break = byte_index + ch.len_utf8();
            cursor_col = 0;
        } else {
            cursor_col += char_display_width(ch);
        }
    }

    if cursor > input.len() {
        return (0, 0);
    }

    let logical_lines: Vec<&str> = input.split('\n').collect();
    let mut display_line = 0;
    for (index, line) in logical_lines.iter().enumerate() {
        let segments = wrap_line_by_width(line, available, available);
        let count = segments.len().max(1);
        if index < cursor_line {
            display_line += count;
        } else if index == cursor_line {
            display_line += cursor_col / available;
            return (display_line, cursor_col % available);
        }
    }

    if last_break < input.len() && cursor >= last_break {
        let remaining = &input[last_break..cursor];
        let extra = remaining.chars().map(char_display_width).sum::<usize>();
        display_line += extra / available;
        return (display_line, extra % available);
    }

    (display_line, 0)
}

fn compute_input_scroll(cursor_line: usize, visible_height: usize) -> usize {
    if visible_height == 0 {
        return 0;
    }
    if cursor_line >= visible_height {
        cursor_line + 1 - visible_height
    } else {
        0
    }
}

fn display_width(text: &str) -> usize {
    UnicodeWidthStr::width(text)
}

fn char_display_width(ch: char) -> usize {
    if ch == '\t' {
        return TAB_WIDTH;
    }
    UnicodeWidthChar::width(ch).unwrap_or(0)
}

fn wrap_line_by_width(line: &str, first_width: usize, next_width: usize) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut current_width = 0;
    let mut limit = first_width.max(1);

    for ch in line.chars() {
        if ch == '\t' {
            let tab_spaces = " ".repeat(TAB_WIDTH);
            if current_width + TAB_WIDTH > limit && current_width > 0 {
                segments.push(current);
                current = String::new();
                current_width = 0;
                limit = next_width.max(1);
            }
            current.push_str(&tab_spaces);
            current_width += TAB_WIDTH;
            continue;
        }

        let width = char_display_width(ch);
        if current_width + width > limit && current_width > 0 {
            segments.push(current);
            current = String::new();
            current_width = 0;
            limit = next_width.max(1);
        }
        current.push(ch);
        current_width += width;
    }

    if segments.is_empty() || !current.is_empty() {
        segments.push(current);
    }
    segments
}

fn draw_chat_indicator(frame: &mut ratatui::Frame, area: Rect, label: &str) {
    let inner = Rect {
        x: area.x + 1,
        y: area.y + 1,
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(2),
    };
    if inner.width == 0 || inner.height == 0 {
        return;
    }

    let text = format!(" {label} ");
    let max_width = inner.width as usize;
    let truncated = truncate_to_width(&text, max_width);
    let width = display_width(&truncated).min(max_width);
    let x = inner.x + inner.width.saturating_sub(width as u16);
    let y = inner.y + inner.height.saturating_sub(1);
    let indicator_area = Rect {
        x,
        y,
        width: width as u16,
        height: 1,
    };

    frame.render_widget(Clear, indicator_area);
    let paragraph = Paragraph::new(truncated)
        .style(Style::default().fg(Color::LightBlue).add_modifier(Modifier::BOLD));
    frame.render_widget(paragraph, indicator_area);
}

fn truncate_to_width(text: &str, max_width: usize) -> String {
    if display_width(text) <= max_width {
        return text.to_string();
    }
    let mut out = String::new();
    let mut width = 0;
    for ch in text.chars() {
        let ch_width = char_display_width(ch);
        if width + ch_width > max_width {
            break;
        }
        out.push(ch);
        width += ch_width;
    }
    out
}

fn draw_help(frame: &mut ratatui::Frame, _app: &App) {
    let area = centered_rect(60, 60, frame.size());
    frame.render_widget(Clear, area);

    let lines = vec![
        Line::from(vec![Span::styled(
            "Help",
            Style::default().add_modifier(Modifier::BOLD),
        )]),
        Line::from(""),
        Line::from("Navigation"),
        Line::from("  ↑/↓        Move selection (picker) / history (chat)"),
        Line::from("  Enter      Select session / send message"),
        Line::from("  n          New session (picker)"),
        Line::from("  d          Delete session (picker, confirm y/n)"),
        Line::from("  /          Filter sessions (picker)"),
        Line::from("  m / p      Edit model / provider (picker)"),
        Line::from("  Ctrl+R     Refresh sessions (picker)"),
        Line::from("  Esc        Switch session (chat) / Quit (picker)"),
        Line::from("  q          Quit (picker)"),
        Line::from(""),
        Line::from("Chat"),
        Line::from("  Ctrl+C     Interrupt / Exit"),
        Line::from("  Ctrl+S     Switch session"),
        Line::from("  Ctrl+U     Clear input"),
        Line::from("  Ctrl+A/E   Line start / end"),
        Line::from("  Ctrl+W/K   Delete word / to end"),
        Line::from("  Shift+Enter Insert newline"),
        Line::from("  Tab        Insert spaces"),
        Line::from("  PgUp/PgDn  Scroll conversation"),
        Line::from("  Ctrl+Home  Jump to top"),
        Line::from("  Ctrl+End   Jump to bottom"),
        Line::from("  F2         Jump to latest"),
        Line::from("  y / n      Approve / reject pending tool"),
        Line::from("  Ctrl+G     Refresh change summary"),
        Line::from("  Ctrl+O     Open first changed file"),
        Line::from(""),
        Line::from("General"),
        Line::from("  F1         Toggle help"),
        Line::from("  ?          Toggle help (picker)"),
        Line::from("  Esc        Close help"),
    ];

    let paragraph = Paragraph::new(lines)
        .block(Block::default().title("Help").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(paragraph, area);
}

fn draw_approval_dialog(frame: &mut ratatui::Frame, approval: &PendingApproval) {
    let area = centered_rect(70, 40, frame.size());
    frame.render_widget(Clear, area);

    let mut lines = vec![
        Line::from(vec![Span::styled(
            "Approval Required",
            Style::default().add_modifier(Modifier::BOLD),
        )]),
        Line::from(""),
        Line::from(format!("Tool: {}", approval.tool_name)),
    ];

    if let Some(risk) = &approval.risk {
        lines.push(Line::from(format!("Risk: {risk}")));
    }
    if let Some(reason) = &approval.reason {
        lines.push(Line::from(format!("Reason: {reason}")));
    }
    if let Some(arguments) = &approval.arguments {
        let preview = truncate_to_width(arguments, MAX_ARG_PREVIEW_WIDTH);
        lines.push(Line::from(format!("Args: {preview}")));
    }

    lines.push(Line::from(""));
    lines.push(Line::from("Press y to approve, n to reject."));

    let paragraph = Paragraph::new(lines)
        .block(Block::default().title("Approval").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(paragraph, area);
}

fn draw_settings_dialog(frame: &mut ratatui::Frame, app: &App, mode: SettingsMode) {
    let area = centered_rect(70, 40, frame.size());
    frame.render_widget(Clear, area);

    let label = match mode {
        SettingsMode::Model => "Model",
        SettingsMode::Provider => "Provider",
    };
    let input_prefix = format!("{label}: ");
    let input_line = format!("{input_prefix}{}", app.settings_input);

    let lines = vec![
        Line::from(vec![Span::styled(
            format!("Set {label}"),
            Style::default().add_modifier(Modifier::BOLD),
        )]),
        Line::from(""),
        Line::from(input_line),
        Line::from(""),
        Line::from("Enter to save, Esc to cancel."),
    ];

    let paragraph = Paragraph::new(lines)
        .block(Block::default().title("Settings").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(paragraph, area);

    let cursor_line = 2usize;
    let cursor_x_offset = display_width(&input_prefix)
        + display_width(&app.settings_input[..app.settings_cursor.min(app.settings_input.len())]);
    let cursor_x = area.x + 1 + cursor_x_offset as u16;
    let max_x = area.x + area.width.saturating_sub(2);
    let cursor_y = area.y + 1 + cursor_line as u16;
    frame.set_cursor(cursor_x.min(max_x), cursor_y);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

fn list_state(selected: usize) -> ratatui::widgets::ListState {
    let mut state = ratatui::widgets::ListState::default();
    state.select(Some(selected));
    state
}

fn resolve_host_path() -> Result<PathBuf> {
    if let Some(path) = env_value("KEEPUP_TUI_HOST") {
        return Ok(PathBuf::from(path));
    }

    let cwd = std::env::current_dir().context("resolve cwd")?;
    let candidate = cwd.join("packages/cli/dist/tui/host.js");
    if candidate.exists() {
        return Ok(candidate);
    }

    bail!("KEEPUP_TUI_HOST not set and default host not found at packages/cli/dist/tui/host.js");
}

fn resolve_node_bin() -> String {
    env_value("KEEPUP_NODE_BIN").unwrap_or_else(|| "node".to_string())
}

fn resolve_editor() -> Option<String> {
    env_value("KEEPUP_TUI_EDITOR")
        .or_else(|| env_value("EDITOR"))
        .or_else(|| env_value("VISUAL"))
}

fn env_value(key: &str) -> Option<String> {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

fn load_cli_config_value(key: &str) -> Option<String> {
    let path = resolve_cli_config_path()?;
    let data = fs::read_to_string(path).ok()?;
    let json: Value = serde_json::from_str(&data).ok()?;
    json.get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn save_cli_config_value(key: &str, value: Option<String>) -> Result<()> {
    let path = resolve_cli_config_path().context("resolve config path")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("create config directory")?;
    }
    let mut config = if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str::<Value>(&data).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    if let Some(map) = config.as_object_mut() {
        match value {
            Some(value) => {
                map.insert(key.to_string(), Value::String(value));
            }
            None => {
                map.remove(key);
            }
        }
    }

    let serialized = serde_json::to_string_pretty(&config).context("serialize config")?;
    fs::write(&path, serialized).context("write config")?;
    Ok(())
}

fn resolve_cli_config_path() -> Option<PathBuf> {
    if let Some(override_dir) = env_value("KEEPUP_STATE_DIR") {
        return Some(PathBuf::from(override_dir).join(CLI_CONFIG_FILE));
    }
    let home_dir = resolve_home_dir()?;
    Some(home_dir.join(DEFAULT_STATE_DIR).join(CLI_CONFIG_FILE))
}

fn resolve_home_dir() -> Option<PathBuf> {
    env_value("HOME")
        .or_else(|| env_value("USERPROFILE"))
        .map(PathBuf::from)
}

fn open_first_changed_file(app: &App) -> Result<String> {
    let Some(changes) = app.git_changes.as_ref() else {
        return Err(anyhow::anyhow!("No change data. Press Ctrl+G first."));
    };
    if let Some(error) = &changes.error {
        return Err(anyhow::anyhow!(error.clone()));
    }
    let entry = changes
        .files
        .iter()
        .find(|entry| !entry.path.starts_with('…'))
        .ok_or_else(|| anyhow::anyhow!("No changed files to open."))?;
    let editor = resolve_editor().ok_or_else(|| {
        anyhow::anyhow!("No editor configured. Set KEEPUP_TUI_EDITOR or EDITOR.")
    })?;

    Command::new(editor)
        .arg(&entry.path)
        .spawn()
        .context("launch editor")?;
    Ok(format!("Opened {}", entry.path))
}

fn load_git_changes() -> GitChanges {
    let output = Command::new("git").args(["status", "--porcelain"]).output();
    let output = match output {
        Ok(output) => output,
        Err(error) => {
            return GitChanges {
                summary: "Git status unavailable.".to_string(),
                files: Vec::new(),
                error: Some(error.to_string()),
            };
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "Git status failed.".to_string()
        } else {
            stderr
        };
        return GitChanges {
            summary: "Git status unavailable.".to_string(),
            files: Vec::new(),
            error: Some(message),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut modified = 0;
    let mut added = 0;
    let mut deleted = 0;
    let mut renamed = 0;
    let mut untracked = 0;
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[..2];
        let file = line[3..].trim();
        if status == "??" {
            untracked += 1;
            files.push(GitChangeEntry {
                status: status.to_string(),
                path: normalize_git_path(file),
            });
            continue;
        }
        if status.contains('M') {
            modified += 1;
        }
        if status.contains('A') {
            added += 1;
        }
        if status.contains('D') {
            deleted += 1;
        }
        if status.contains('R') {
            renamed += 1;
        }
        files.push(GitChangeEntry {
            status: status.to_string(),
            path: normalize_git_path(file),
        });
    }

    if files.is_empty() {
        return GitChanges {
            summary: "Clean working tree.".to_string(),
            files,
            error: None,
        };
    }

    let summary = format!(
        "Modified {modified}, Added {added}, Deleted {deleted}, Renamed {renamed}, Untracked {untracked}"
    );
    if files.len() > MAX_CHANGE_FILES {
        let extra = files.len().saturating_sub(MAX_CHANGE_FILES);
        files.truncate(MAX_CHANGE_FILES);
        files.push(GitChangeEntry {
            status: String::new(),
            path: format!("… and {extra} more"),
        });
    }

    GitChanges {
        summary,
        files,
        error: None,
    }
}

fn normalize_git_path(raw: &str) -> String {
    if let Some((_, new_path)) = raw.rsplit_once(" -> ") {
        return new_path.trim().to_string();
    }
    raw.trim_matches('"').to_string()
}
