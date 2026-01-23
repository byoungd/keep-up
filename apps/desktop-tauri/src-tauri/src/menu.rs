use tauri::menu::{Menu, MenuEvent, MenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Result, Runtime};

const MENU_ID_QUIT: &str = "quit";
const MENU_ID_RELOAD: &str = "reload";
const MENU_ID_TOGGLE_DEVTOOLS: &str = "toggle-devtools";

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>> {
    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, app.package_info().name.clone())
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu.append(&app_menu)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = SubmenuBuilder::new(app, "File")
            .item(&MenuItem::with_id(
                app,
                MENU_ID_QUIT,
                "Quit",
                true,
                Some("Ctrl+Q"),
            )?)
            .build()?;
        menu.append(&file_menu)?;
    }

    #[cfg(target_os = "macos")]
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    #[cfg(not(target_os = "macos"))]
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    menu.append(&edit_menu)?;

    let mut view_menu = SubmenuBuilder::new(app, "View").item(&MenuItem::with_id(
        app,
        MENU_ID_RELOAD,
        "Reload",
        true,
        Some("CmdOrCtrl+R"),
    )?);

    #[cfg(any(debug_assertions, feature = "devtools"))]
    {
        view_menu = view_menu
            .separator()
            .item(&MenuItem::with_id(
                app,
                MENU_ID_TOGGLE_DEVTOOLS,
                "Toggle Developer Tools",
                true,
                Some("CmdOrCtrl+Shift+I"),
            )?);
    }

    let view_menu = view_menu.build()?;
    menu.append(&view_menu)?;

    #[cfg(target_os = "macos")]
    {
        let window_menu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .fullscreen()
            .separator()
            .close_window()
            .build()?;
        menu.append(&window_menu)?;
    }

    Ok(menu)
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == MENU_ID_QUIT {
        app.exit(0);
        return;
    }

    if event.id() == MENU_ID_RELOAD {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.reload();
        }
        return;
    }

    #[cfg(any(debug_assertions, feature = "devtools"))]
    if event.id() == MENU_ID_TOGGLE_DEVTOOLS {
        if let Some(window) = app.get_webview_window("main") {
            if window.is_devtools_open() {
                window.close_devtools();
            } else {
                window.open_devtools();
            }
        }
    }
}
