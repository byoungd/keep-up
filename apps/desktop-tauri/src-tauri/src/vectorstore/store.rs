use rusqlite::{params, types::Value, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{Chunk, ChunkInput, DeleteChunksArgs, IndexProgress, IndexStatus, ListChunksArgs, SearchQuery, SearchResult, VectorStoreStats};

const DEFAULT_CHUNK_SIZE: usize = 1200;
const DEFAULT_CHUNK_OVERLAP: usize = 200;

#[derive(Clone)]
pub struct VectorStore {
    connection: Arc<Mutex<Connection>>,
}

impl VectorStore {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        let connection = Connection::open(&path).map_err(|error| error.to_string())?;
        initialize_schema(&connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn upsert_chunks(&self, chunks: Vec<ChunkInput>) -> Result<(), String> {
        if chunks.is_empty() {
            return Ok(());
        }

        let now = current_timestamp();
        let mut connection = self.lock_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;

        for chunk in chunks {
            let token_count = chunk
                .token_count
                .or_else(|| Some(estimate_token_count(&chunk.content)));
            let (embedding_blob, embedding_dim) = match chunk.embedding {
                Some(embedding) => {
                    let dim = embedding.len() as i32;
                    (Some(encode_embedding(&embedding)), Some(dim))
                }
                None => (None, None),
            };

            tx.execute(
                r#"
                INSERT INTO chunks (
                    file_path,
                    chunk_index,
                    content,
                    token_count,
                    embedding,
                    embedding_dim,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(file_path, chunk_index) DO UPDATE SET
                    content = excluded.content,
                    token_count = excluded.token_count,
                    embedding = excluded.embedding,
                    embedding_dim = excluded.embedding_dim,
                    updated_at = excluded.updated_at
                "#,
                params![
                    chunk.file_path,
                    chunk.chunk_index,
                    chunk.content,
                    token_count,
                    embedding_blob,
                    embedding_dim,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
        }

        tx.commit().map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn list_chunks(&self, args: ListChunksArgs) -> Result<Vec<Chunk>, String> {
        let connection = self.lock_connection()?;
        let limit = args.limit.unwrap_or(50).min(500);
        let offset = args.offset.unwrap_or(0);
        let (query, params) = build_list_query(&args.file_filter, limit, offset);

        let mut stmt = connection
            .prepare(&query)
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params), |row| {
                Ok(Chunk {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    chunk_index: row.get(2)?,
                    content: row.get(3)?,
                    token_count: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|error| error.to_string())?;

        let mut chunks = Vec::new();
        for row in rows {
            chunks.push(row.map_err(|error| error.to_string())?);
        }

        Ok(chunks)
    }

    pub fn search(&self, query: SearchQuery) -> Result<Vec<SearchResult>, String> {
        let connection = self.lock_connection()?;
        let limit = query.limit.unwrap_or(10).min(50);
        let min_score = query.min_score.unwrap_or(0.0);
        let normalized_query = query.query.trim().to_string();
        let query_embedding = query.embedding;

        let (sql, params) = build_search_query(&query.file_filter);
        let mut stmt = connection.prepare(&sql).map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params), |row| {
                let embedding: Option<Vec<u8>> = row.get(7)?;
                let embedding_dim: Option<i32> = row.get(8)?;
                let decoded = embedding
                    .as_ref()
                    .and_then(|bytes| decode_embedding(bytes, embedding_dim));
                Ok((
                    Chunk {
                        id: row.get(0)?,
                        file_path: row.get(1)?,
                        chunk_index: row.get(2)?,
                        content: row.get(3)?,
                        token_count: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    },
                    decoded,
                ))
            })
            .map_err(|error| error.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            let (chunk, embedding) = row.map_err(|error| error.to_string())?;
            let text_score = if normalized_query.is_empty() {
                0.0
            } else {
                text_score(&chunk.content, &normalized_query)
            };

            let vector_score = if let (Some(query_vec), Some(stored_vec)) =
                (query_embedding.as_ref(), embedding.as_ref())
            {
                cosine_similarity(query_vec, stored_vec).unwrap_or(0.0)
            } else {
                0.0
            };

            let score = text_score.max(vector_score);
            if score < min_score {
                continue;
            }

            results.push(SearchResult {
                chunk,
                score,
                highlights: Vec::new(),
            });
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        Ok(results)
    }

    pub fn delete_chunks(&self, args: DeleteChunksArgs) -> Result<usize, String> {
        let mut connection = self.lock_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let mut deleted = 0usize;

        if args.delete_all.unwrap_or(false) {
            deleted += tx
                .execute("DELETE FROM chunks", [])
                .map_err(|error| error.to_string())? as usize;
        }

        if let Some(ids) = args.ids {
            if !ids.is_empty() {
                let placeholders = repeat_placeholders(ids.len());
                let sql = format!("DELETE FROM chunks WHERE id IN ({placeholders})");
                deleted += tx
                    .execute(&sql, rusqlite::params_from_iter(ids))
                    .map_err(|error| error.to_string())? as usize;
            }
        }

        if let Some(paths) = args.file_paths {
            if !paths.is_empty() {
                let placeholders = repeat_placeholders(paths.len());
                let sql = format!("DELETE FROM chunks WHERE file_path IN ({placeholders})");
                deleted += tx
                    .execute(&sql, rusqlite::params_from_iter(paths))
                    .map_err(|error| error.to_string())? as usize;
            }
        }

        tx.commit().map_err(|error| error.to_string())?;
        Ok(deleted)
    }

    pub fn stats(&self) -> Result<VectorStoreStats, String> {
        let connection = self.lock_connection()?;
        let total_chunks: usize = connection
            .query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let total_files: usize = connection
            .query_row(
                "SELECT COUNT(DISTINCT file_path) FROM chunks",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let last_updated: Option<i64> = connection
            .query_row(
                "SELECT MAX(updated_at) FROM chunks",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        Ok(VectorStoreStats {
            total_chunks,
            total_files,
            last_updated,
        })
    }

    pub fn index_files<F>(
        &self,
        paths: &[String],
        chunk_size: usize,
        overlap: usize,
        mut emit: F,
    ) -> Result<(), String>
    where
        F: FnMut(IndexProgress),
    {
        let total_files = paths.len();
        emit(IndexProgress {
            total_files,
            processed_files: 0,
            current_file: "".to_string(),
            status: IndexStatus::Indexing,
        });

        for (index, path) in paths.iter().enumerate() {
            emit(IndexProgress {
                total_files,
                processed_files: index,
                current_file: path.clone(),
                status: IndexStatus::Indexing,
            });

            let content = match std::fs::read_to_string(path) {
                Ok(content) => content,
                Err(error) => {
                    emit(IndexProgress {
                        total_files,
                        processed_files: index,
                        current_file: path.clone(),
                        status: IndexStatus::Error(format!(
                            "Failed to read {path}: {error}"
                        )),
                    });
                    continue;
                }
            };

            self.delete_chunks(DeleteChunksArgs {
                ids: None,
                file_paths: Some(vec![path.clone()]),
                delete_all: Some(false),
            })?;

            let chunks = chunk_text(&content, chunk_size, overlap);
            let inputs = chunks
                .into_iter()
                .enumerate()
                .map(|(chunk_index, chunk)| ChunkInput {
                    file_path: path.clone(),
                    chunk_index: chunk_index as i32,
                    content: chunk,
                    token_count: None,
                    embedding: None,
                })
                .collect();

            self.upsert_chunks(inputs)?;

            emit(IndexProgress {
                total_files,
                processed_files: index + 1,
                current_file: path.clone(),
                status: IndexStatus::Indexing,
            });
        }

        emit(IndexProgress {
            total_files,
            processed_files: total_files,
            current_file: "".to_string(),
            status: IndexStatus::Completed,
        });
        Ok(())
    }

    pub fn default_chunk_size() -> usize {
        DEFAULT_CHUNK_SIZE
    }

    pub fn default_chunk_overlap() -> usize {
        DEFAULT_CHUNK_OVERLAP
    }

    fn lock_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "Vector store lock poisoned".to_string())
    }
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                token_count INTEGER,
                embedding BLOB,
                embedding_dim INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(file_path, chunk_index)
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
            CREATE INDEX IF NOT EXISTS idx_chunks_updated ON chunks(updated_at);
            "#,
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn build_list_query(
    file_filter: &Option<Vec<String>>,
    limit: usize,
    offset: usize,
) -> (String, Vec<Value>) {
    let mut params: Vec<Value> = Vec::new();
    let mut sql = String::from(
        "SELECT id, file_path, chunk_index, content, token_count, created_at, updated_at FROM chunks",
    );

    if let Some(paths) = file_filter {
        if !paths.is_empty() {
            let placeholders = repeat_placeholders(paths.len());
            sql.push_str(&format!(" WHERE file_path IN ({placeholders})"));
            params.extend(paths.iter().cloned().map(Value::from));
        }
    }

    sql.push_str(" ORDER BY updated_at DESC LIMIT ? OFFSET ?");
    params.push(Value::from(limit as i64));
    params.push(Value::from(offset as i64));
    (sql, params)
}

fn build_search_query(file_filter: &Option<Vec<String>>) -> (String, Vec<Value>) {
    let mut params: Vec<Value> = Vec::new();
    let mut sql = String::from(
        "SELECT id, file_path, chunk_index, content, token_count, created_at, updated_at, embedding, embedding_dim FROM chunks",
    );

    if let Some(paths) = file_filter {
        if !paths.is_empty() {
            let placeholders = repeat_placeholders(paths.len());
            sql.push_str(&format!(" WHERE file_path IN ({placeholders})"));
            params.extend(paths.iter().cloned().map(Value::from));
        }
    }

    (sql, params)
}

fn repeat_placeholders(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(",")
}

fn encode_embedding(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for value in embedding {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn decode_embedding(bytes: &[u8], dim: Option<i32>) -> Option<Vec<f32>> {
    if bytes.is_empty() {
        return None;
    }
    if bytes.len() % 4 != 0 {
        return None;
    }
    if let Some(dim) = dim {
        if bytes.len() / 4 != dim as usize {
            return None;
        }
    }
    let mut embedding = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.chunks_exact(4) {
        embedding.push(f32::from_le_bytes([
            chunk[0], chunk[1], chunk[2], chunk[3],
        ]));
    }
    Some(embedding)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> Option<f32> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }

    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for (lhs, rhs) in a.iter().zip(b.iter()) {
        dot += lhs * rhs;
        norm_a += lhs * lhs;
        norm_b += rhs * rhs;
    }

    let magnitude = (norm_a * norm_b).sqrt();
    if magnitude == 0.0 {
        return Some(0.0);
    }

    Some(dot / magnitude)
}

fn text_score(content: &str, query: &str) -> f32 {
    let normalized = content.to_lowercase();
    let query = query.to_lowercase();
    if normalized == query {
        return 1.0;
    }
    if normalized.contains(&query) {
        let ratio = query.len() as f32 / normalized.len().max(1) as f32;
        return (ratio + 0.3).min(0.9);
    }
    0.0
}

fn chunk_text(content: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if content.is_empty() {
        return Vec::new();
    }

    let chunk_size = chunk_size.max(64);
    let overlap = overlap.min(chunk_size.saturating_sub(1));
    let step = chunk_size.saturating_sub(overlap).max(1);

    let mut indices: Vec<usize> = content.char_indices().map(|(index, _)| index).collect();
    indices.push(content.len());
    let total_chars = indices.len().saturating_sub(1);

    let mut chunks = Vec::new();
    let mut start = 0usize;

    while start < total_chars {
        let end = (start + chunk_size).min(total_chars);
        let start_idx = indices[start];
        let end_idx = indices[end];
        chunks.push(content[start_idx..end_idx].to_string());
        start += step;
    }

    chunks
}

fn estimate_token_count(content: &str) -> i32 {
    content.split_whitespace().count() as i32
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
