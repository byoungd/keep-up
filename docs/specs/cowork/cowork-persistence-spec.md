# Cowork Persistence Spec

> **Philosophy**: **Local-First**. Data lives on the user's machine.
> We use **SQLite** for structured metadata (Sessions, Tasks) and **FileSystem** for large artifacts.

**Related Specs:**
- [Agent Runtime Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/agent-runtime-spec-2026.md) — Storage Schema (Sec 8)
- [Data Flow Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-data-flow-spec.md) — Event types stored
- [API Contracts](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-api-contracts.md) — Artifact API

---

## 1. Storage Strategy

| Data Type | Storage Engine | Location | Rationale |
| :--- | :--- | :--- | :--- |
| **Sessions & Tasks** | SQLite (`better-sqlite3`) | `~/.cowork/db.sqlite` | Relational integrity, fast queries. |
| **Run Logs (Events)** | SQLite (Log Table) | `~/.cowork/db.sqlite` | Append-only, queryable history. |
| **Artifacts (Files)** | FileSystem | `~/.cowork/artifacts/` | Easy user access, standard file tools. |
| **Vector Index** | LanceDB / SQLite Vec | `~/.cowork/vectors/` | Fast semantic search. |

## 2. SQLite Schema (Schema v1)

### 2.1 Sessions Table
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT -- JSON: { deviceId, platform }
);
```

### 2.2 Tasks Table
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT,
  status TEXT CHECK(status IN ('queued', 'running', 'completed', 'failed')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  cost_usd REAL DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

### 2.3 Event Stream (The Source of Truth)
We use Event Sourcing lite. The state is derived from events.
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'task.created', 'tool.result'
  payload TEXT NOT NULL, -- JSON
  timestamp INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);
```

## 3. File System Structure

```
~/.cowork/
  ├── db.sqlite           # Main Database
  ├── db.sqlite-wal       # Write-Ahead Log
  ├── artifacts/
  │   ├── <task-id>/
  │   │   ├── plan.md     # The Task Plan
  │   │   ├── diff.patch  # Code changes
  │   │   └── report.pdf  # Generated outputs
  │   └── ...
  └── logs/
      └── server.log      # Debug logs
```

## 4. Backup & Migration

*   **Migration**: We use `db-migrate` or custom SQL scripts run at startup.
*   **Backup**: Since it's local-first, we provide a "Export Data" button that zips the `~/.cowork` folder.
