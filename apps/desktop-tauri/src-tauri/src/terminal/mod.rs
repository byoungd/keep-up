use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Manager, State};

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

struct PtySession {
    _master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

#[derive(Deserialize)]
pub struct SpawnTerminalArgs {
    pub id: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[tauri::command]
pub async fn spawn_terminal(
    args: SpawnTerminalArgs,
    app: AppHandle,
    manager: State<'_, PtyManager>,
) -> Result<(), String> {
    let sessions_guard = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session lock poisoned".to_string())?;

    if sessions_guard.contains_key(&args.id) {
        return Err(format!("PTY session already exists: {}", args.id));
    }
    drop(sessions_guard);

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: args.rows.unwrap_or(DEFAULT_ROWS),
        cols: args.cols.unwrap_or(DEFAULT_COLS),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut command = CommandBuilder::new(&args.cmd);
    command.args(&args.args);
    if let Some(cwd) = &args.cwd {
        command.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("Failed to spawn PTY command: {e}"))?;

    let mut master = pair.master;
    let writer = master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;
    let mut reader = master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    let session_id = args.id.clone();
    let app_handle = app.clone();
    let sessions_ref = manager.sessions.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(bytes_read) => {
                    let chunk = buffer[..bytes_read].to_vec();
                    let _ = app_handle.emit(&format!("term-data-{session_id}"), chunk);
                }
                Err(_) => break,
            }
        }

        let _ = app_handle.emit(&format!("term-exit-{session_id}"), ());
        if let Ok(mut sessions) = sessions_ref.lock() {
            sessions.remove(&session_id);
        }
    });

    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session lock poisoned".to_string())?;
    sessions.insert(
        args.id,
        PtySession {
            _master: master,
            writer,
            child,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn write_terminal(
    id: String,
    data: Vec<u8>,
    manager: State<'_, PtyManager>,
) -> Result<(), String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session lock poisoned".to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("PTY session not found: {id}"))?;

    session
        .writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write to PTY: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn kill_terminal(id: String, manager: State<'_, PtyManager>) -> Result<(), String> {
    let session = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session lock poisoned".to_string())?
        .remove(&id)
        .ok_or_else(|| format!("PTY session not found: {id}"))?;

    session
        .child
        .kill()
        .map_err(|e| format!("Failed to kill PTY process: {e}"))?;
    let _ = session.child.wait();

    Ok(())
}
