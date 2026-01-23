use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

const STATE_FILE_NAME: &str = "window-state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredWindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
    fullscreen: bool,
}

pub fn restore(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => return,
    };

    let state = match read_state(app) {
        Some(state) => state,
        None => return,
    };

    if !state.maximized && !state.fullscreen {
        let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
        let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    } else {
        let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    }

    if state.maximized {
        let _ = window.maximize();
    }

    if state.fullscreen {
        let _ = window.set_fullscreen(true);
    }
}

pub fn handle_window_event(window: &WebviewWindow, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::ScaleFactorChanged { .. }
        | WindowEvent::CloseRequested { .. } => {
            persist_state(window);
        }
        _ => {}
    }
}

fn persist_state(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let state = match capture_state(window) {
        Some(state) => state,
        None => return,
    };

    tauri::async_runtime::spawn(async move {
        let path = match state_path(&app) {
            Some(path) => path,
            None => return,
        };

        let Ok(serialized) = serde_json::to_string(&state) else {
            return;
        };

        let _ = fs::write(path, serialized);
    });
}

fn capture_state(window: &WebviewWindow) -> Option<StoredWindowState> {
    let size = window.outer_size().ok()?;
    let position = window.outer_position().ok()?;
    let maximized = window.is_maximized().ok().unwrap_or(false);
    let fullscreen = window.is_fullscreen().ok().unwrap_or(false);

    Some(StoredWindowState {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized,
        fullscreen,
    })
}

fn read_state(app: &AppHandle) -> Option<StoredWindowState> {
    let path = state_path(app)?;
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    Some(dir.join(STATE_FILE_NAME))
}
