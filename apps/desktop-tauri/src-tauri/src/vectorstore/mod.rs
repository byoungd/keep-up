pub(crate) mod commands;
mod store;
mod types;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub use store::VectorStore;
pub use types::*;

const DB_FILE_NAME: &str = "vectorstore.sqlite3";

pub fn init(app: &AppHandle) -> Result<VectorStore, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let path = PathBuf::from(dir).join(DB_FILE_NAME);
    VectorStore::new(path)
}
