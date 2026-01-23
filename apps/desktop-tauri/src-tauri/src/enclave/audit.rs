use std::collections::VecDeque;

use crate::enclave::{AuditEntry, Decision};

pub const DEFAULT_AUDIT_CAPACITY: usize = 256;

#[derive(Debug)]
pub struct AuditLog {
    capacity: usize,
    entries: VecDeque<AuditEntry>,
}

impl AuditLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            entries: VecDeque::with_capacity(capacity),
        }
    }

    pub fn log(
        &mut self,
        action: impl Into<String>,
        target: impl Into<String>,
        decision: Decision,
        session_id: impl Into<String>,
    ) {
        self.push(AuditEntry::new(action, target, decision, session_id));
    }

    pub fn push(&mut self, entry: AuditEntry) {
        if self.capacity == 0 {
            return;
        }

        if self.entries.len() == self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    pub fn list(&self, limit: Option<usize>) -> Vec<AuditEntry> {
        let limit = limit.unwrap_or(self.entries.len());
        let start = self.entries.len().saturating_sub(limit);
        self.entries.iter().skip(start).cloned().collect()
    }
}

impl Default for AuditLog {
    fn default() -> Self {
        Self::new(DEFAULT_AUDIT_CAPACITY)
    }
}
