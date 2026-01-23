mod commands;
mod store;
mod types;

use std::path::PathBuf;

use tauri::AppHandle;

pub use commands::{
    vectorstore_delete_chunks, vectorstore_index_files, vectorstore_list_chunks,
    vectorstore_search, vectorstore_stats, vectorstore_upsert_chunks,
};
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
