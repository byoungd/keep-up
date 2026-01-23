use tauri::{AppHandle, Manager, State};

use super::{
    DeleteChunksArgs, IndexFilesArgs, IndexProgress, IndexStatus, ListChunksArgs, SearchQuery,
    VectorStore, VectorStoreStats,
};

#[tauri::command]
pub fn vectorstore_upsert_chunks(
    chunks: Vec<super::ChunkInput>,
    store: State<'_, VectorStore>,
) -> Result<(), String> {
    store.upsert_chunks(chunks)
}

#[tauri::command]
pub fn vectorstore_list_chunks(
    args: ListChunksArgs,
    store: State<'_, VectorStore>,
) -> Result<Vec<super::Chunk>, String> {
    store.list_chunks(args)
}

#[tauri::command]
pub fn vectorstore_search(
    query: SearchQuery,
    store: State<'_, VectorStore>,
) -> Result<Vec<super::SearchResult>, String> {
    store.search(query)
}

#[tauri::command]
pub fn vectorstore_delete_chunks(
    args: DeleteChunksArgs,
    store: State<'_, VectorStore>,
) -> Result<usize, String> {
    store.delete_chunks(args)
}

#[tauri::command]
pub fn vectorstore_stats(store: State<'_, VectorStore>) -> Result<VectorStoreStats, String> {
    store.stats()
}

#[tauri::command]
pub fn vectorstore_index_files(
    args: IndexFilesArgs,
    store: State<'_, VectorStore>,
    app: AppHandle,
) -> Result<(), String> {
    if args.paths.is_empty() {
        return Err("No paths provided".to_string());
    }

    let chunk_size = args
        .chunk_size
        .unwrap_or_else(VectorStore::default_chunk_size);
    let overlap = args
        .overlap
        .unwrap_or_else(VectorStore::default_chunk_overlap);
    let event_name = format!("vectorstore-index-{}", args.id);

    let store = store.inner().clone();
    std::thread::spawn(move || {
        let emit_progress = |progress: IndexProgress| {
            let _ = app.emit(&event_name, progress);
        };

        if let Err(error) = store.index_files(&args.paths, chunk_size, overlap, emit_progress) {
            let _ = app.emit(
                &event_name,
                IndexProgress {
                    total_files: args.paths.len(),
                    processed_files: 0,
                    current_file: "".to_string(),
                    status: IndexStatus::Error(error),
                },
            );
        }
    });

    Ok(())
}
