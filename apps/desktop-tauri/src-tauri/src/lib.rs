// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod menu;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            window_state::restore(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            window_state::handle_window_event(window, event);
        })
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
