use notify::{
    event::{EventKind, ModifyKind},
    Event, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::Path,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DEFAULT_DEBOUNCE_MS: u64 = 50;

pub struct WatcherManager {
    app: AppHandle,
    sessions: Arc<Mutex<HashMap<String, WatcherSession>>>,
}

impl WatcherManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

struct WatcherSession {
    _watcher: RecommendedWatcher,
}

#[derive(Deserialize)]
pub struct WatchPathsArgs {
    pub id: String,
    pub paths: Vec<String>,
    pub recursive: Option<bool>,
    pub debounce_ms: Option<u64>,
}

#[derive(Serialize)]
pub struct FileWatcherBatch {
    pub events: Vec<FileWatcherEvent>,
}

#[derive(Serialize)]
pub struct FileWatcherEvent {
    pub kind: String,
    pub raw_kind: String,
    pub paths: Vec<String>,
    pub timestamp_ms: u64,
    pub error: Option<String>,
}

#[tauri::command]
pub fn watch_paths(
    args: WatchPathsArgs,
    manager: tauri::State<'_, WatcherManager>,
) -> Result<(), String> {
    if args.paths.is_empty() {
        return Err("No paths provided".to_string());
    }

    let sessions_guard = manager
        .sessions
        .lock()
        .map_err(|_| "Watcher session lock poisoned".to_string())?;

    if sessions_guard.contains_key(&args.id) {
        return Err(format!("Watcher session already exists: {}", args.id));
    }
    drop(sessions_guard);

    let debounce = Duration::from_millis(args.debounce_ms.unwrap_or(DEFAULT_DEBOUNCE_MS));
    let recursive_mode = if args.recursive.unwrap_or(true) {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };

    let (sender, receiver) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = sender.send(res);
    })
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    for path in &args.paths {
        watcher
            .watch(Path::new(path), recursive_mode)
            .map_err(|e| format!("Failed to watch path {path}: {e}"))?;
    }

    let app_handle = manager.app.clone();
    let session_id = args.id.clone();
    spawn_watcher_worker(app_handle, session_id.clone(), debounce, receiver);

    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Watcher session lock poisoned".to_string())?;
    sessions.insert(
        args.id,
        WatcherSession {
            _watcher: watcher,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn unwatch_paths(id: String, manager: tauri::State<'_, WatcherManager>) -> Result<(), String> {
    let removed = manager
        .sessions
        .lock()
        .map_err(|_| "Watcher session lock poisoned".to_string())?
        .remove(&id);

    if removed.is_some() {
        Ok(())
    } else {
        Err(format!("Watcher session not found: {id}"))
    }
}

fn spawn_watcher_worker(
    app: AppHandle,
    session_id: String,
    debounce: Duration,
    receiver: mpsc::Receiver<notify::Result<Event>>,
) {
    thread::spawn(move || {
        let mut buffer: Vec<FileWatcherEvent> = Vec::new();

        loop {
            let event = match receiver.recv() {
                Ok(event) => event,
                Err(_) => break,
            };

            buffer.push(map_event(event));
            let start = Instant::now();

            while start.elapsed() < debounce {
                let timeout = debounce.saturating_sub(start.elapsed());
                match receiver.recv_timeout(timeout) {
                    Ok(event) => buffer.push(map_event(event)),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }

            if buffer.is_empty() {
                continue;
            }

            let batch = FileWatcherBatch {
                events: std::mem::take(&mut buffer),
            };
            let _ = app.emit(&format!("file-watch-{session_id}"), batch);
        }
    });
}

fn map_event(event: notify::Result<Event>) -> FileWatcherEvent {
    match event {
        Ok(event) => FileWatcherEvent {
            kind: normalize_kind(&event.kind),
            raw_kind: format!("{:?}", event.kind),
            paths: event
                .paths
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect(),
            timestamp_ms: now_ms(),
            error: None,
        },
        Err(error) => FileWatcherEvent {
            kind: "error".to_string(),
            raw_kind: "error".to_string(),
            paths: Vec::new(),
            timestamp_ms: now_ms(),
            error: Some(error.to_string()),
        },
    }
}

fn normalize_kind(kind: &EventKind) -> String {
    match kind {
        EventKind::Create(_) => "created".to_string(),
        EventKind::Remove(_) => "removed".to_string(),
        EventKind::Modify(ModifyKind::Name(_)) => "renamed".to_string(),
        EventKind::Modify(_) => "modified".to_string(),
        EventKind::Access(_) => "accessed".to_string(),
        EventKind::Any => "changed".to_string(),
        EventKind::Other => "other".to_string(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
