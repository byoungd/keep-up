// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod enclave;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            window_state::restore(app);
            Ok(())
        })
        .on_window_event(|window, event| {
            window_state::handle_window_event(window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .manage(enclave::EnclaveState::new())
        .invoke_handler(tauri::generate_handler![
            enclave::get_policy,
            enclave::set_policy,
            enclave::get_audit_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
