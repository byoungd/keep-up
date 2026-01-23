// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod enclave;
mod logs;
mod menu;
mod terminal;
mod watcher;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            window_state::restore(app.handle());
            let app_handle = app.handle().clone();
            let logs_state = logs::init(app_handle.clone());
            app.manage(logs_state);
            app.manage(terminal::PtyManager::default());
            app.manage(watcher::WatcherManager::new(app_handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            window_state::handle_window_event(window, event);
        })
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
        .plugin(tauri_plugin_opener::init())
        .manage(enclave::EnclaveState::new())
        .invoke_handler(tauri::generate_handler![
            enclave::get_policy,
            enclave::set_policy,
            enclave::get_audit_log,
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::kill_terminal,
            watcher::watch_paths,
            watcher::unwatch_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
