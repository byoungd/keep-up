use tauri::menu::{Menu, MenuEvent, SubmenuBuilder};
use tauri::{AppHandle, Result, Runtime};

#[cfg(not(target_os = "macos"))]
use tauri::menu::MenuItem;

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
            .item(&MenuItem::with_id(app, "quit", "Quit", true, Some("Ctrl+Q"))?)
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
    if event.id() == "quit" {
        app.exit(0);
    }
}
