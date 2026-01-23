use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, State};

const DEEPLINK_EVENT: &str = "deep-link";

#[derive(Default)]
pub struct DeepLinkState {
    pending: Mutex<Option<String>>,
}

impl DeepLinkState {
    pub fn set(&self, url: String) {
        if let Ok(mut guard) = self.pending.lock() {
            *guard = Some(url);
        }
    }

    pub fn take(&self) -> Option<String> {
        self.pending.lock().ok().and_then(|mut guard| guard.take())
    }
}

pub fn extract_startup_deeplink() -> Option<String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    extract_deeplink(&args)
}

pub fn extract_deeplink(args: &[String]) -> Option<String> {
    for arg in args {
        if is_deeplink(arg) {
            return Some(arg.clone());
        }
    }
    None
}

pub fn store_and_emit<R: Runtime>(app: &AppHandle<R>, url: String) {
    let state: State<'_, DeepLinkState> = app.state();
    state.set(url.clone());
    emit_deeplink(app, &url);
}

#[tauri::command]
pub fn get_pending_deep_link(state: State<'_, DeepLinkState>) -> Option<String> {
    state.take()
}

fn emit_deeplink<R: Runtime>(app: &AppHandle<R>, url: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit(DEEPLINK_EVENT, url.to_string());
}

fn is_deeplink(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.starts_with("cowork://") || lower.starts_with("keepup://")
}
