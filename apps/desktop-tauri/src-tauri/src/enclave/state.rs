use std::sync::{Mutex, MutexGuard};

use crate::enclave::{AuditLog, EnclavePolicy};

#[derive(Debug)]
pub struct EnclaveState {
    policy: Mutex<EnclavePolicy>,
    audit: Mutex<AuditLog>,
}

impl EnclaveState {
    pub fn new() -> Self {
        Self {
            policy: Mutex::new(EnclavePolicy::default()),
            audit: Mutex::new(AuditLog::default()),
        }
    }

    pub fn policy(&self) -> Result<MutexGuard<'_, EnclavePolicy>, String> {
        self.policy
            .lock()
            .map_err(|_| "Enclave policy state poisoned".to_string())
    }

    pub fn audit(&self) -> Result<MutexGuard<'_, AuditLog>, String> {
        self.audit
            .lock()
            .map_err(|_| "Enclave audit state poisoned".to_string())
    }
}

impl Default for EnclaveState {
    fn default() -> Self {
        Self::new()
    }
}
