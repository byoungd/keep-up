use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::PathBuf,
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
    pub cmd: Option<String>,
    pub args: Option<Vec<String>>,
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

    let (command_path, command_args) = resolve_command(args.cmd.clone(), args.args.clone());
    let mut command = CommandBuilder::new(&command_path);
    if !command_args.is_empty() {
        command.args(&command_args);
    }
    if let Some(cwd) = resolve_cwd(args.cwd.as_deref()) {
        command.cwd(cwd);
    }
    if cfg!(unix) && env::var_os("TERM").is_none() {
        command.env("TERM", "xterm-256color");
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

fn resolve_command(cmd: Option<String>, args: Option<Vec<String>>) -> (String, Vec<String>) {
    if let Some(cmd) = cmd {
        return (cmd, args.unwrap_or_default());
    }

    let (default_cmd, default_args) = default_shell();
    let args = args.unwrap_or(default_args);
    (default_cmd, args)
}

fn resolve_cwd(cwd: Option<&str>) -> Option<PathBuf> {
    if let Some(cwd) = cwd {
        let path = PathBuf::from(cwd);
        if path.is_dir() {
            return Some(path);
        }
    }

    if let Some(home) = tauri::path::home_dir() {
        if home.is_dir() {
            return Some(home);
        }
    }

    env::current_dir().ok().filter(|path| path.is_dir())
}

fn default_shell() -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        if let Some(path) = find_in_path("pwsh.exe") {
            return (path, vec!["-NoLogo".to_string()]);
        }
        if let Some(path) = find_in_path("powershell.exe") {
            return (path, vec!["-NoLogo".to_string()]);
        }
        if let Ok(comspec) = env::var("ComSpec") {
            if !comspec.trim().is_empty() {
                return (comspec, Vec::new());
            }
        }
        return ("cmd.exe".to_string(), Vec::new());
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(shell) = env::var("SHELL") {
            if !shell.trim().is_empty() {
                return (shell, Vec::new());
            }
        }

        for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if PathBuf::from(candidate).exists() {
                return (candidate.to_string(), Vec::new());
            }
        }

        ("sh".to_string(), Vec::new())
    }
}

fn find_in_path(binary: &str) -> Option<String> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
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
