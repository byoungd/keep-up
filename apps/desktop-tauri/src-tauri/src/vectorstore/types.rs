use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: i64,
    pub file_path: String,
    pub chunk_index: i32,
    pub content: String,
    pub token_count: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChunkInput {
    pub file_path: String,
    pub chunk_index: i32,
    pub content: String,
    pub token_count: Option<i32>,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub chunk: Chunk,
    pub score: f32,
    pub highlights: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub limit: Option<usize>,
    pub file_filter: Option<Vec<String>>,
    pub min_score: Option<f32>,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListChunksArgs {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub file_filter: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteChunksArgs {
    pub ids: Option<Vec<i64>>,
    pub file_paths: Option<Vec<String>>,
    pub delete_all: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VectorStoreStats {
    pub total_chunks: usize,
    pub total_files: usize,
    pub last_updated: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IndexFilesArgs {
    pub id: String,
    pub paths: Vec<String>,
    pub chunk_size: Option<usize>,
    pub overlap: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IndexProgress {
    pub total_files: usize,
    pub processed_files: usize,
    pub current_file: String,
    pub status: IndexStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", content = "message", rename_all = "snake_case")]
#[allow(dead_code)]
pub enum IndexStatus {
    Idle,
    Indexing,
    Completed,
    Error(String),
}
