use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EnclavePolicy {
    /// Allowed root directories for read/write
    pub allowed_roots: HashSet<PathBuf>,
    /// Allowed shell commands (exact match or prefix)
    pub allowed_commands: HashSet<String>,
    /// Network allowlist (hostnames)
    pub allowed_hosts: HashSet<String>,
    /// Session ID for audit correlation
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub timestamp: i64,
    pub action: String,
    pub target: String,
    pub decision: Decision,
    pub session_id: String,
}

impl AuditEntry {
    pub fn new(
        action: impl Into<String>,
        target: impl Into<String>,
        decision: Decision,
        session_id: impl Into<String>,
    ) -> Self {
        Self {
            timestamp: current_timestamp_millis(),
            action: action.into(),
            target: target.into(),
            decision,
            session_id: session_id.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Decision {
    Allowed,
    Denied { reason: String },
    NeedsConfirmation,
}

fn current_timestamp_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
