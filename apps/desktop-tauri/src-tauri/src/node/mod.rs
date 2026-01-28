mod adapter;

use tauri::AppHandle;

pub fn start_node_adapter(app: AppHandle) {
    adapter::spawn_node_adapter(app);
}
