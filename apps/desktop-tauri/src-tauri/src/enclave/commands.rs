use tauri::State;

use crate::enclave::{AuditEntry, Decision, EnclavePolicy, EnclaveState};

#[tauri::command]
pub fn get_policy(state: State<'_, EnclaveState>) -> Result<EnclavePolicy, String> {
    let policy = state.policy()?;
    Ok(policy.clone())
}

#[tauri::command]
pub fn set_policy(policy: EnclavePolicy, state: State<'_, EnclaveState>) -> Result<(), String> {
    {
        let mut current = state.policy()?;
        *current = policy.clone();
    }

    let mut audit = state.audit()?;
    audit.log("set_policy", "policy", Decision::Allowed, policy.session_id.clone());
    Ok(())
}

#[tauri::command]
pub fn get_audit_log(
    limit: Option<usize>,
    state: State<'_, EnclaveState>,
) -> Result<Vec<AuditEntry>, String> {
    let audit = state.audit()?;
    Ok(audit.list(limit))
}
