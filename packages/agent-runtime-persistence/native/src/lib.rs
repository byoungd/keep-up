use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use napi::bindgen_prelude::Result as NapiResult;
use napi::Error as NapiError;
use napi_derive::napi;
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      run_id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output_hash TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cost_usd REAL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_events_run ON tool_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_model_events_run ON model_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_events_session ON workspace_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_task_runs_status ON task_runs(status);
    CREATE INDEX IF NOT EXISTS idx_task_runs_started_at ON task_runs(started_at);
    "#,
];

#[napi(object)]
pub struct PersistenceConfig {
    #[napi(js_name = "dbPath")]
    pub db_path: String,
    #[napi(js_name = "encryptionKeyRef")]
    pub encryption_key_ref: Option<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct TaskRun {
    #[napi(js_name = "runId")]
    pub run_id: String,
    pub goal: String,
    pub status: String,
    #[napi(js_name = "startedAt")]
    pub started_at: i64,
    #[napi(js_name = "endedAt")]
    pub ended_at: Option<i64>,
    pub metadata: Option<Value>,
}

#[napi(object)]
#[derive(Clone)]
pub struct ToolEvent {
    #[napi(js_name = "eventId")]
    pub event_id: String,
    #[napi(js_name = "runId")]
    pub run_id: String,
    #[napi(js_name = "toolId")]
    pub tool_id: String,
    #[napi(js_name = "inputHash")]
    pub input_hash: String,
    #[napi(js_name = "outputHash")]
    pub output_hash: String,
    #[napi(js_name = "durationMs")]
    pub duration_ms: i64,
    #[napi(js_name = "createdAt")]
    pub created_at: i64,
}

#[napi(object)]
#[derive(Clone)]
pub struct ModelEvent {
    #[napi(js_name = "eventId")]
    pub event_id: String,
    #[napi(js_name = "runId")]
    pub run_id: String,
    #[napi(js_name = "providerId")]
    pub provider_id: String,
    #[napi(js_name = "modelId")]
    pub model_id: String,
    #[napi(js_name = "inputTokens")]
    pub input_tokens: i64,
    #[napi(js_name = "outputTokens")]
    pub output_tokens: i64,
    #[napi(js_name = "totalTokens")]
    pub total_tokens: i64,
    #[napi(js_name = "costUsd")]
    pub cost_usd: Option<f64>,
    #[napi(js_name = "createdAt")]
    pub created_at: i64,
}

#[napi(object)]
#[derive(Clone)]
pub struct WorkspaceEvent {
    #[napi(js_name = "eventId")]
    pub event_id: String,
    #[napi(js_name = "sessionId")]
    pub session_id: String,
    pub kind: String,
    #[napi(js_name = "payloadHash")]
    pub payload_hash: String,
    #[napi(js_name = "createdAt")]
    pub created_at: i64,
}

#[napi(object)]
pub struct ExportBundle {
    #[napi(js_name = "taskRuns")]
    pub task_runs: Vec<TaskRun>,
    #[napi(js_name = "toolEvents")]
    pub tool_events: Vec<ToolEvent>,
    #[napi(js_name = "modelEvents")]
    pub model_events: Vec<ModelEvent>,
    #[napi(js_name = "workspaceEvents")]
    pub workspace_events: Vec<WorkspaceEvent>,
}

#[napi(object)]
pub struct TaskRunFilter {
    #[napi(js_name = "runId")]
    pub run_id: Option<String>,
    pub status: Option<Vec<String>>,
    #[napi(js_name = "startedAfter")]
    pub started_after: Option<i64>,
    #[napi(js_name = "startedBefore")]
    pub started_before: Option<i64>,
    pub limit: Option<i64>,
}

#[napi(object)]
pub struct ExportFilter {
    #[napi(js_name = "runId")]
    pub run_id: Option<String>,
    #[napi(js_name = "sessionId")]
    pub session_id: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
struct EncryptedPayload {
    version: u8,
    algorithm: String,
    iv: Option<String>,
    ciphertext: String,
}

struct PersistenceState {
    encryption_key: Option<Vec<u8>>,
    db_path: Option<String>,
}

#[napi]
pub struct PersistenceStore {
    state: Arc<Mutex<PersistenceState>>,
}

#[napi]
impl PersistenceStore {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(PersistenceState {
                encryption_key: None,
                db_path: None,
            })),
        }
    }

    #[napi]
    pub fn open(&self, config: PersistenceConfig) -> NapiResult<()> {
        if config.db_path.trim().is_empty() {
            return Err(napi_error("dbPath is required"));
        }

        let key = match config.encryption_key_ref {
            Some(value) => Some(resolve_encryption_key(&value)?),
            None => None,
        };

        let db_path = config.db_path;
        if let Some(parent) = Path::new(&db_path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| napi_error(format!("failed to create db directory: {err}")))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|err| napi_error(format!("failed to open db: {err}")))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|err| napi_error(format!("failed to set journal mode: {err}")))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|err| napi_error(format!("failed to enable foreign keys: {err}")))?;

        apply_migrations(&conn)?;

        let mut state = self.lock_state()?;
        state.db_path = Some(db_path);
        state.encryption_key = key;
        Ok(())
    }

    #[napi(js_name = "saveTaskRun")]
    pub fn save_task_run(&self, task_run: TaskRun) -> NapiResult<()> {
        let conn = self.connection()?;
        let metadata = task_run
            .metadata
            .map(|value| serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string()));
        conn.execute(
            r#"
            INSERT INTO task_runs (run_id, goal, status, started_at, ended_at, metadata)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(run_id) DO UPDATE SET
              goal = excluded.goal,
              status = excluded.status,
              started_at = excluded.started_at,
              ended_at = excluded.ended_at,
              metadata = excluded.metadata
            "#,
            params![
                task_run.run_id,
                task_run.goal,
                task_run.status,
                task_run.started_at,
                task_run.ended_at,
                metadata,
            ],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "updateTaskRunStatus")]
    pub fn update_task_run_status(
        &self,
        run_id: String,
        status: String,
        ended_at: Option<i64>,
    ) -> NapiResult<()> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            UPDATE task_runs
            SET status = ?1,
                ended_at = COALESCE(?2, ended_at)
            WHERE run_id = ?3
            "#,
            params![status, ended_at, run_id],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "listTaskRuns")]
    pub fn list_task_runs(&self, filter: Option<TaskRunFilter>) -> NapiResult<Vec<TaskRun>> {
        let conn = self.connection()?;
        let mut clauses: Vec<String> = Vec::new();
        let mut params: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(filter) = filter {
            if let Some(run_id) = filter.run_id {
                clauses.push("run_id = ?".to_string());
                params.push(run_id.into());
            }
            if let Some(statuses) = filter.status {
                if !statuses.is_empty() {
                    let placeholders = vec!["?"; statuses.len()].join(", ");
                    clauses.push(format!("status IN ({placeholders})"));
                    for status in statuses {
                        params.push(status.into());
                    }
                }
            }
            if let Some(started_after) = filter.started_after {
                clauses.push("started_at >= ?".to_string());
                params.push(started_after.into());
            }
            if let Some(started_before) = filter.started_before {
                clauses.push("started_at <= ?".to_string());
                params.push(started_before.into());
            }
            if let Some(limit) = filter.limit {
                params.push(limit.into());
                clauses.push("__limit__".to_string());
            }
        }

        let mut sql =
            "SELECT run_id, goal, status, started_at, ended_at, metadata FROM task_runs"
                .to_string();
        let mut limit_value: Option<rusqlite::types::Value> = None;

        if let Some(index) = clauses.iter().position(|value| value == "__limit__") {
            clauses.remove(index);
            if let Some(last) = params.pop() {
                limit_value = Some(last);
            }
        }

        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY started_at DESC");
        if limit_value.is_some() {
            sql.push_str(" LIMIT ?");
            params.push(limit_value.unwrap());
        }

        let mut statement = conn.prepare(&sql).map_err(to_napi_error)?;
        let rows = statement
            .query_map(rusqlite::params_from_iter(params), |row| {
                let metadata_text: Option<String> = row.get(5)?;
                let metadata = metadata_text
                    .and_then(|value| serde_json::from_str(&value).ok());
                Ok(TaskRun {
                    run_id: row.get(0)?,
                    goal: row.get(1)?,
                    status: row.get(2)?,
                    started_at: row.get(3)?,
                    ended_at: row.get(4)?,
                    metadata,
                })
            })
            .map_err(to_napi_error)?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(to_napi_error)?);
        }
        Ok(results)
    }

    #[napi(js_name = "saveToolEvent")]
    pub fn save_tool_event(&self, event: ToolEvent) -> NapiResult<()> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO tool_events (
              event_id,
              run_id,
              tool_id,
              input_hash,
              output_hash,
              duration_ms,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(event_id) DO UPDATE SET
              run_id = excluded.run_id,
              tool_id = excluded.tool_id,
              input_hash = excluded.input_hash,
              output_hash = excluded.output_hash,
              duration_ms = excluded.duration_ms,
              created_at = excluded.created_at
            "#,
            params![
                event.event_id,
                event.run_id,
                event.tool_id,
                event.input_hash,
                event.output_hash,
                event.duration_ms,
                event.created_at
            ],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "saveModelEvent")]
    pub fn save_model_event(&self, event: ModelEvent) -> NapiResult<()> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO model_events (
              event_id,
              run_id,
              provider_id,
              model_id,
              input_tokens,
              output_tokens,
              total_tokens,
              cost_usd,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(event_id) DO UPDATE SET
              run_id = excluded.run_id,
              provider_id = excluded.provider_id,
              model_id = excluded.model_id,
              input_tokens = excluded.input_tokens,
              output_tokens = excluded.output_tokens,
              total_tokens = excluded.total_tokens,
              cost_usd = excluded.cost_usd,
              created_at = excluded.created_at
            "#,
            params![
                event.event_id,
                event.run_id,
                event.provider_id,
                event.model_id,
                event.input_tokens,
                event.output_tokens,
                event.total_tokens,
                event.cost_usd,
                event.created_at
            ],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "saveWorkspaceEvent")]
    pub fn save_workspace_event(&self, event: WorkspaceEvent) -> NapiResult<()> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO workspace_events (
              event_id,
              session_id,
              kind,
              payload_hash,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(event_id) DO UPDATE SET
              session_id = excluded.session_id,
              kind = excluded.kind,
              payload_hash = excluded.payload_hash,
              created_at = excluded.created_at
            "#,
            params![
                event.event_id,
                event.session_id,
                event.kind,
                event.payload_hash,
                event.created_at
            ],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "storeSecret")]
    pub fn store_secret(&self, key: String, plaintext: String) -> NapiResult<()> {
        let conn = self.connection()?;
        let encryption_key = self.encryption_key()?;
        let payload = encrypt_payload(&plaintext, encryption_key.as_deref())?;
        let now = now_ms();
        conn.execute(
            r#"
            INSERT INTO secrets (key, encrypted_payload, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(key) DO UPDATE SET
              encrypted_payload = excluded.encrypted_payload,
              updated_at = excluded.updated_at
            "#,
            params![key, payload, now, now],
        )
        .map_err(to_napi_error)?;
        Ok(())
    }

    #[napi(js_name = "loadSecret")]
    pub fn load_secret(&self, key: String) -> NapiResult<Option<String>> {
        let conn = self.connection()?;
        let encryption_key = self.encryption_key()?;
        let mut statement = conn
            .prepare("SELECT encrypted_payload FROM secrets WHERE key = ?")
            .map_err(to_napi_error)?;
        let result = statement
            .query_row(params![key], |row| row.get::<_, String>(0))
            .optional()
            .map_err(to_napi_error)?;

        let payload = match result {
            Some(value) => value,
            None => return Ok(None),
        };
        let decrypted = decrypt_payload(&payload, encryption_key.as_deref())?;
        Ok(Some(decrypted))
    }

    #[napi(js_name = "exportBundle")]
    pub fn export_bundle(&self, filter: Option<ExportFilter>) -> NapiResult<ExportBundle> {
        let conn = self.connection()?;
        let filter = filter.unwrap_or(ExportFilter {
            run_id: None,
            session_id: None,
            since: None,
            until: None,
            limit: None,
        });

        let task_runs = query_task_runs(&conn, &filter)?;
        let tool_events = query_tool_events(&conn, &filter)?;
        let model_events = query_model_events(&conn, &filter)?;
        let workspace_events = query_workspace_events(&conn, &filter)?;

        Ok(ExportBundle {
            task_runs,
            tool_events,
            model_events,
            workspace_events,
        })
    }

    #[napi]
    pub fn reset(&self) -> NapiResult<()> {
        let conn = self.connection()?;
        conn.execute_batch(
            r#"
            DELETE FROM task_runs;
            DELETE FROM tool_events;
            DELETE FROM model_events;
            DELETE FROM workspace_events;
            DELETE FROM secrets;
            "#,
        )
        .map_err(to_napi_error)?;
        Ok(())
    }
}

impl PersistenceStore {
    fn lock_state(&self) -> NapiResult<std::sync::MutexGuard<'_, PersistenceState>> {
        self.state
            .lock()
            .map_err(|_| napi_error("PersistenceStore state lock poisoned"))
    }

    fn connection(&self) -> NapiResult<Connection> {
        let state = self.lock_state()?;
        let db_path = state
            .db_path
            .as_ref()
            .ok_or_else(|| napi_error("PersistenceStore is not opened"))?
            .clone();
        drop(state);

        let conn = Connection::open(&db_path)
            .map_err(|err| napi_error(format!("failed to open db: {err}")))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|err| napi_error(format!("failed to set journal mode: {err}")))?;
        Ok(conn)
    }

    fn encryption_key(&self) -> NapiResult<Option<Vec<u8>>> {
        let state = self.lock_state()?;
        Ok(state.encryption_key.clone())
    }
}

fn apply_migrations(conn: &Connection) -> NapiResult<()> {
    conn.execute_batch(MIGRATIONS[0]).map_err(to_napi_error)?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)",
        [],
    )
    .map_err(to_napi_error)?;
    Ok(())
}

fn query_task_runs(conn: &Connection, filter: &ExportFilter) -> NapiResult<Vec<TaskRun>> {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(run_id) = &filter.run_id {
        clauses.push("run_id = ?".to_string());
        params.push(run_id.clone().into());
    }
    if let Some(since) = filter.since {
        clauses.push("started_at >= ?".to_string());
        params.push(since.into());
    }
    if let Some(until) = filter.until {
        clauses.push("started_at <= ?".to_string());
        params.push(until.into());
    }

    let mut sql =
        "SELECT run_id, goal, status, started_at, ended_at, metadata FROM task_runs".to_string();
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(" ORDER BY started_at DESC");
    if let Some(limit) = filter.limit {
        sql.push_str(" LIMIT ?");
        params.push(limit.into());
    }

    let mut statement = conn.prepare(&sql).map_err(to_napi_error)?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            let metadata_text: Option<String> = row.get(5)?;
            let metadata = metadata_text.and_then(|value| serde_json::from_str(&value).ok());
            Ok(TaskRun {
                run_id: row.get(0)?,
                goal: row.get(1)?,
                status: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                metadata,
            })
        })
        .map_err(to_napi_error)?;

    let mut output = Vec::new();
    for row in rows {
        output.push(row.map_err(to_napi_error)?);
    }
    Ok(output)
}

fn query_tool_events(conn: &Connection, filter: &ExportFilter) -> NapiResult<Vec<ToolEvent>> {
    let (sql, params) = build_event_query(
        "tool_events",
        "created_at",
        "run_id",
        filter,
    );
    let mut statement = conn.prepare(&sql).map_err(to_napi_error)?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(ToolEvent {
                event_id: row.get(0)?,
                run_id: row.get(1)?,
                tool_id: row.get(2)?,
                input_hash: row.get(3)?,
                output_hash: row.get(4)?,
                duration_ms: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(to_napi_error)?;

    let mut output = Vec::new();
    for row in rows {
        output.push(row.map_err(to_napi_error)?);
    }
    Ok(output)
}

fn query_model_events(conn: &Connection, filter: &ExportFilter) -> NapiResult<Vec<ModelEvent>> {
    let (sql, params) = build_event_query(
        "model_events",
        "created_at",
        "run_id",
        filter,
    );
    let mut statement = conn.prepare(&sql).map_err(to_napi_error)?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(ModelEvent {
                event_id: row.get(0)?,
                run_id: row.get(1)?,
                provider_id: row.get(2)?,
                model_id: row.get(3)?,
                input_tokens: row.get(4)?,
                output_tokens: row.get(5)?,
                total_tokens: row.get(6)?,
                cost_usd: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(to_napi_error)?;

    let mut output = Vec::new();
    for row in rows {
        output.push(row.map_err(to_napi_error)?);
    }
    Ok(output)
}

fn query_workspace_events(
    conn: &Connection,
    filter: &ExportFilter,
) -> NapiResult<Vec<WorkspaceEvent>> {
    let (sql, params) = build_event_query(
        "workspace_events",
        "created_at",
        "session_id",
        filter,
    );
    let mut statement = conn.prepare(&sql).map_err(to_napi_error)?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(WorkspaceEvent {
                event_id: row.get(0)?,
                session_id: row.get(1)?,
                kind: row.get(2)?,
                payload_hash: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(to_napi_error)?;

    let mut output = Vec::new();
    for row in rows {
        output.push(row.map_err(to_napi_error)?);
    }
    Ok(output)
}

fn build_event_query(
    table: &str,
    timestamp_column: &str,
    run_column: &str,
    filter: &ExportFilter,
) -> (String, Vec<rusqlite::types::Value>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    if table == "workspace_events" {
        if let Some(session_id) = &filter.session_id {
            clauses.push("session_id = ?".to_string());
            params.push(session_id.clone().into());
        }
    } else if let Some(run_id) = &filter.run_id {
        clauses.push(format!("{run_column} = ?"));
        params.push(run_id.clone().into());
    }
    if let Some(since) = filter.since {
        clauses.push(format!("{timestamp_column} >= ?"));
        params.push(since.into());
    }
    if let Some(until) = filter.until {
        clauses.push(format!("{timestamp_column} <= ?"));
        params.push(until.into());
    }

    let mut sql = match table {
        "tool_events" => format!(
            "SELECT event_id, run_id, tool_id, input_hash, output_hash, duration_ms, created_at FROM {table}"
        ),
        "model_events" => format!(
            "SELECT event_id, run_id, provider_id, model_id, input_tokens, output_tokens, total_tokens, cost_usd, created_at FROM {table}"
        ),
        "workspace_events" => {
            format!(
                "SELECT event_id, session_id, kind, payload_hash, created_at FROM {table}"
            )
        }
        _ => format!("SELECT * FROM {table}"),
    };

    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(&format!(" ORDER BY {timestamp_column} DESC"));
    if let Some(limit) = filter.limit {
        sql.push_str(" LIMIT ?");
        params.push(limit.into());
    }
    (sql, params)
}

fn resolve_encryption_key(key_ref: &str) -> NapiResult<Vec<u8>> {
    let value = std::env::var(key_ref).unwrap_or_else(|_| key_ref.to_string());
    let key = decode_key_string(&value)?;
    if key.len() != 32 {
        return Err(napi_error("encryption key must be 32 bytes"));
    }
    Ok(key)
}

fn decode_key_string(value: &str) -> NapiResult<Vec<u8>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(napi_error("encryption key is empty"));
    }
    let is_hex = trimmed.len() % 2 == 0 && trimmed.chars().all(|c| c.is_ascii_hexdigit());
    let decoded = if is_hex {
        hex::decode(trimmed).map_err(|err| napi_error(format!("invalid hex key: {err}")))?
    } else {
        BASE64
            .decode(trimmed.as_bytes())
            .map_err(|err| napi_error(format!("invalid base64 key: {err}")))?
    };
    Ok(decoded)
}

fn encrypt_payload(plaintext: &str, key: Option<&[u8]>) -> NapiResult<String> {
    if let Some(key) = key {
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|_| napi_error("failed to create AES-256-GCM cipher"))?;
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| napi_error("encryption failed"))?;
        let payload = EncryptedPayload {
            version: 1,
            algorithm: "aes-256-gcm".to_string(),
            iv: Some(BASE64.encode(nonce_bytes)),
            ciphertext: BASE64.encode(ciphertext),
        };
        return serde_json::to_string(&payload)
            .map_err(|err| napi_error(format!("failed to encode payload: {err}")));
    }

    let payload = EncryptedPayload {
        version: 1,
        algorithm: "none".to_string(),
        iv: None,
        ciphertext: BASE64.encode(plaintext.as_bytes()),
    };
    serde_json::to_string(&payload)
        .map_err(|err| napi_error(format!("failed to encode payload: {err}")))
}

fn decrypt_payload(payload: &str, key: Option<&[u8]>) -> NapiResult<String> {
    let parsed: EncryptedPayload = serde_json::from_str(payload)
        .map_err(|err| napi_error(format!("invalid encrypted payload: {err}")))?;

    if parsed.algorithm == "none" {
        let bytes = BASE64
            .decode(parsed.ciphertext.as_bytes())
            .map_err(|err| napi_error(format!("invalid base64 payload: {err}")))?;
        return String::from_utf8(bytes)
            .map_err(|err| napi_error(format!("invalid utf8 payload: {err}")));
    }

    if parsed.algorithm != "aes-256-gcm" {
        return Err(napi_error("unsupported encryption algorithm"));
    }

    let key = key.ok_or_else(|| napi_error("encryption key not configured"))?;
    let iv = parsed
        .iv
        .ok_or_else(|| napi_error("encrypted payload missing iv"))?;
    let nonce_bytes = BASE64
        .decode(iv.as_bytes())
        .map_err(|err| napi_error(format!("invalid iv encoding: {err}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = BASE64
        .decode(parsed.ciphertext.as_bytes())
        .map_err(|err| napi_error(format!("invalid ciphertext encoding: {err}")))?;

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| napi_error("failed to create AES-256-GCM cipher"))?;
    let decrypted = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| napi_error("decryption failed"))?;
    String::from_utf8(decrypted).map_err(|err| napi_error(format!("invalid utf8: {err}")))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn napi_error(message: impl Into<String>) -> NapiError {
    NapiError::from_reason(message.into())
}

fn to_napi_error(err: rusqlite::Error) -> NapiError {
    napi_error(err.to_string())
}

trait OptionalRow<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalRow<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_store(path: &str, encryption_key_ref: Option<String>) -> PersistenceStore {
        let store = PersistenceStore::new();
        store
            .open(PersistenceConfig {
                db_path: path.to_string(),
                encryption_key_ref,
            })
            .unwrap();
        store
    }

    #[test]
    fn migrations_are_idempotent() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("store.db");
        let store = create_store(db_path.to_str().unwrap(), None);
        store
            .open(PersistenceConfig {
                db_path: db_path.to_string_lossy().to_string(),
                encryption_key_ref: None,
            })
            .unwrap();
    }

    #[test]
    fn secrets_round_trip_with_encryption() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("store.db");
        // Safe for test: single-threaded env var mutation within test process.
        unsafe {
            std::env::set_var(
                "TEST_PERSISTENCE_KEY",
                "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            );
        }
        let store = create_store(
            db_path.to_str().unwrap(),
            Some("TEST_PERSISTENCE_KEY".to_string()),
        );
        store
            .store_secret("api-key".to_string(), "secret-value".to_string())
            .unwrap();
        let loaded = store.load_secret("api-key".to_string()).unwrap();
        assert_eq!(loaded, Some("secret-value".to_string()));
    }

    #[test]
    fn secrets_round_trip_without_encryption() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("store.db");
        let store = create_store(db_path.to_str().unwrap(), None);
        store
            .store_secret("token".to_string(), "plain".to_string())
            .unwrap();
        let loaded = store.load_secret("token".to_string()).unwrap();
        assert_eq!(loaded, Some("plain".to_string()));
    }

    #[test]
    fn export_bundle_redacts_secrets() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("store.db");
        let store = create_store(db_path.to_str().unwrap(), None);
        store
            .save_task_run(TaskRun {
                run_id: "run-1".to_string(),
                goal: "test".to_string(),
                status: "completed".to_string(),
                started_at: now_ms(),
                ended_at: None,
                metadata: None,
            })
            .unwrap();
        store
            .store_secret("secret".to_string(), "value".to_string())
            .unwrap();
        store
            .save_tool_event(ToolEvent {
                event_id: "evt-1".to_string(),
                run_id: "run-1".to_string(),
                tool_id: "file:read".to_string(),
                input_hash: "hash-in".to_string(),
                output_hash: "hash-out".to_string(),
                duration_ms: 10,
                created_at: now_ms(),
            })
            .unwrap();

        let bundle = store.export_bundle(None).unwrap();
        assert_eq!(bundle.task_runs.len(), 1);
        assert_eq!(bundle.tool_events.len(), 1);
        assert_eq!(bundle.model_events.len(), 0);
        assert_eq!(bundle.workspace_events.len(), 0);
    }
}
