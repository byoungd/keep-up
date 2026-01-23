// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod deeplink;
mod enclave;
mod logs;
mod menu;
mod terminal;
mod vectorstore;
mod watcher;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(deeplink::DeepLinkState::default())
        .manage(enclave::EnclaveState::new())
        .setup(|app| {
            window_state::restore(app.handle());

            let app_handle = app.handle().clone();
            let logs_state = logs::init(app_handle.clone());
            app.manage(logs_state);
            app.manage(terminal::PtyManager::default());
            app.manage(watcher::WatcherManager::new(app_handle.clone()));

            let vector_store = vectorstore::init(&app_handle).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error)
            })?;
            app.manage(vector_store);

            if let Some(url) = deeplink::extract_startup_deeplink() {
                deeplink::store_and_emit(&app_handle, url);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            window_state::handle_window_event(window, event);
        })
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = deeplink::extract_deeplink(&argv) {
                deeplink::store_and_emit(app, url);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            deeplink::get_pending_deep_link,
            enclave::get_policy,
            enclave::set_policy,
            enclave::get_audit_log,
            enclave::export_audit_log,
            enclave::fs_read,
            enclave::fs_write,
            enclave::fs_list,
            enclave::shell_exec,
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::kill_terminal,
            watcher::watch_paths,
            watcher::unwatch_paths,
            vectorstore::vectorstore_upsert_chunks,
            vectorstore::vectorstore_list_chunks,
            vectorstore::vectorstore_search,
            vectorstore::vectorstore_delete_chunks,
            vectorstore::vectorstore_stats,
            vectorstore::vectorstore_index_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
