use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, Window,
    WindowEvent,
};

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

pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => return,
    };

    let state = match read_state(app) {
        Some(state) => state,
        None => return,
    };

    if state.width == 0 || state.height == 0 {
        return;
    }

    let should_restore_bounds = !state.maximized && !state.fullscreen;
    if should_restore_bounds {
        let monitors = window.available_monitors().unwrap_or_default();
        if is_state_visible(&state, &monitors) {
            let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
            let _ = window.set_size(PhysicalSize::new(state.width, state.height));
        } else {
            center_window(&window, &state);
        }
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

fn is_state_visible(state: &StoredWindowState, monitors: &[Monitor]) -> bool {
    const MIN_VISIBLE_PX: i32 = 48;
    let win_left = state.x;
    let win_top = state.y;
    let win_right = state.x + state.width as i32;
    let win_bottom = state.y + state.height as i32;

    for monitor in monitors {
        let pos = monitor.position();
        let size = monitor.size();
        let mon_left = pos.x;
        let mon_top = pos.y;
        let mon_right = pos.x + size.width as i32;
        let mon_bottom = pos.y + size.height as i32;

        let visible_width = (win_right.min(mon_right) - win_left.max(mon_left)).max(0);
        let visible_height = (win_bottom.min(mon_bottom) - win_top.max(mon_top)).max(0);

        if visible_width >= MIN_VISIBLE_PX && visible_height >= MIN_VISIBLE_PX {
            return true;
        }
    }

    false
}

fn center_window<R: Runtime>(window: &WebviewWindow<R>, state: &StoredWindowState) {
    let monitor = match window.primary_monitor().ok().flatten() {
        Some(monitor) => monitor,
        None => return,
    };

    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let width = state.width.min(monitor_size.width);
    let height = state.height.min(monitor_size.height);
    let offset_x = ((monitor_size.width.saturating_sub(width)) / 2) as i32;
    let offset_y = ((monitor_size.height.saturating_sub(height)) / 2) as i32;

    let _ = window.set_size(PhysicalSize::new(width, height));
    let _ = window.set_position(PhysicalPosition::new(
        monitor_pos.x + offset_x,
        monitor_pos.y + offset_y,
    ));
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
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

fn persist_state<R: Runtime>(window: &Window<R>) {
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

fn capture_state<R: Runtime>(window: &Window<R>) -> Option<StoredWindowState> {
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

fn read_state<R: Runtime>(app: &AppHandle<R>) -> Option<StoredWindowState> {
    let path = state_path(app)?;
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    Some(dir.join(STATE_FILE_NAME))
}
