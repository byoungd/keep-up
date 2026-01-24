use napi::bindgen_prelude::Result as NapiResult;
use napi::Error as NapiError;
use napi_derive::napi;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[napi(object)]
pub struct WorkspaceSessionConfig {
    #[napi(js_name = "sessionId")]
    pub session_id: Option<String>,
    pub kind: String,
    #[napi(js_name = "ownerAgentId")]
    pub owner_agent_id: Option<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct WorkspaceSession {
    #[napi(js_name = "sessionId")]
    pub session_id: String,
    pub kind: String,
    pub status: String,
    #[napi(js_name = "ownerAgentId")]
    pub owner_agent_id: Option<String>,
    #[napi(js_name = "createdAt")]
    pub created_at: i64,
    #[napi(js_name = "updatedAt")]
    pub updated_at: i64,
}

#[napi(object)]
#[derive(Clone)]
pub struct WorkspaceEvent {
    pub sequence: u32,
    #[napi(js_name = "sessionId")]
    pub session_id: String,
    #[napi(js_name = "type")]
    pub event_type: String,
    pub timestamp: i64,
    pub payload: Value,
}

#[napi(object)]
pub struct WorkspaceSnapshot {
    pub sessions: Vec<WorkspaceSession>,
    #[napi(js_name = "eventCursor")]
    pub event_cursor: u32,
}

#[napi(object)]
pub struct ApprovalRequestInput {
    #[napi(js_name = "requestId")]
    pub request_id: Option<String>,
    pub kind: String,
    pub payload: Value,
    #[napi(js_name = "timeoutMs")]
    pub timeout_ms: Option<i64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct ApprovalRequest {
    #[napi(js_name = "requestId")]
    pub request_id: String,
    pub kind: String,
    pub payload: Value,
    #[napi(js_name = "requestedAt")]
    pub requested_at: i64,
    #[napi(js_name = "timeoutMs")]
    pub timeout_ms: Option<i64>,
}

#[napi(object)]
pub struct ApprovalDecisionInput {
    #[napi(js_name = "requestId")]
    pub request_id: String,
    pub status: Option<String>,
    pub approved: Option<bool>,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct ApprovalDecision {
    #[napi(js_name = "requestId")]
    pub request_id: String,
    pub status: String,
    pub approved: bool,
    pub reason: Option<String>,
}

#[derive(Clone)]
struct ApprovalRecord {
    status: String,
    expires_at: Option<i64>,
}

struct WorkspaceState {
    sessions: HashMap<String, WorkspaceSession>,
    events: Vec<WorkspaceEvent>,
    approvals: HashMap<String, ApprovalRecord>,
    pending_approvals: usize,
    next_session: u64,
    next_approval: u64,
    next_sequence: u32,
}

impl WorkspaceState {
    fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            events: Vec::new(),
            approvals: HashMap::new(),
            pending_approvals: 0,
            next_session: 1,
            next_approval: 1,
            next_sequence: 1,
        }
    }

    fn next_session_id(&mut self) -> String {
        let id = format!("ws-{}", self.next_session);
        self.next_session += 1;
        id
    }

    fn next_approval_id(&mut self) -> String {
        let id = format!("approval-{}", self.next_approval);
        self.next_approval += 1;
        id
    }

    fn append_event(&mut self, session_id: &str, event_type: &str, payload: Value) -> WorkspaceEvent {
        let event = WorkspaceEvent {
            sequence: self.next_sequence,
            session_id: session_id.to_string(),
            event_type: event_type.to_string(),
            timestamp: now_ms(),
            payload: normalize_payload(payload),
        };
        self.next_sequence += 1;
        self.events.push(event.clone());
        event
    }

    fn update_status(&mut self, session_id: &str, status: &str) -> NapiResult<()> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| napi_error("Workspace session not found"))?;
        session.status = status.to_string();
        session.updated_at = now_ms();
        let payload = json!({ "status": status });
        self.append_event(session_id, "status", payload);
        Ok(())
    }

    fn event_cursor(&self) -> u32 {
        self.next_sequence.saturating_sub(1)
    }

    fn expire_approvals(&mut self, now: i64) {
        let expired: Vec<String> = self
            .approvals
            .iter()
            .filter_map(|(request_id, record)| {
                if record.status != "pending" {
                    return None;
                }
                let expires_at = record.expires_at?;
                if expires_at <= now {
                    Some(request_id.clone())
                } else {
                    None
                }
            })
            .collect();

        for request_id in expired {
            self.approvals.remove(&request_id);
            if self.pending_approvals > 0 {
                self.pending_approvals -= 1;
            }
        }
    }
}

#[napi]
pub struct WorkspaceSessionManager {
    state: Arc<Mutex<WorkspaceState>>,
}

#[napi]
impl WorkspaceSessionManager {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(WorkspaceState::new())),
        }
    }

    #[napi(js_name = "createSession")]
    pub fn create_session(&self, config: WorkspaceSessionConfig) -> NapiResult<WorkspaceSession> {
        let mut state = self.lock_state()?;
        let session_id = config.session_id.unwrap_or_else(|| state.next_session_id());
        if state.sessions.contains_key(&session_id) {
            return Err(napi_error("Workspace session already exists"));
        }

        let now = now_ms();
        let session = WorkspaceSession {
            session_id: session_id.clone(),
            kind: config.kind,
            status: "created".to_string(),
            owner_agent_id: config.owner_agent_id,
            created_at: now,
            updated_at: now,
        };

        state.sessions.insert(session_id.clone(), session.clone());
        state.update_status(&session_id, "active")?;
        Ok(session)
    }

    #[napi(js_name = "pauseSession")]
    pub fn pause_session(&self, session_id: String) -> NapiResult<()> {
        let mut state = self.lock_state()?;
        state.update_status(&session_id, "paused")
    }

    #[napi(js_name = "resumeSession")]
    pub fn resume_session(&self, session_id: String) -> NapiResult<()> {
        let mut state = self.lock_state()?;
        state.update_status(&session_id, "active")
    }

    #[napi(js_name = "closeSession")]
    pub fn close_session(&self, session_id: String) -> NapiResult<()> {
        let mut state = self.lock_state()?;
        state.update_status(&session_id, "closed")
    }

    #[napi(js_name = "sendInput")]
    pub fn send_input(&self, session_id: String, payload: Value) -> NapiResult<()> {
        let mut state = self.lock_state()?;
        state.expire_approvals(now_ms());
        if state.pending_approvals > 0 {
            return Err(napi_error("Workspace sessions are blocked pending approval"));
        }
        let session = state
            .sessions
            .get(&session_id)
            .ok_or_else(|| napi_error("Workspace session not found"))?;
        if session.status == "closed" {
            return Err(napi_error("Workspace session is closed"));
        }
        state.append_event(&session_id, "prompt", payload);
        Ok(())
    }

    #[napi(js_name = "drainEvents")]
    pub fn drain_events(
        &self,
        after: Option<u32>,
        limit: Option<u32>,
    ) -> NapiResult<Vec<WorkspaceEvent>> {
        let state = self.lock_state()?;
        let mut output: Vec<WorkspaceEvent> = Vec::new();
        for event in state.events.iter() {
            if let Some(after_value) = after {
                if event.sequence <= after_value {
                    continue;
                }
            }
            output.push(event.clone());
            if let Some(limit_value) = limit {
                if output.len() >= limit_value as usize {
                    break;
                }
            }
        }
        Ok(output)
    }

    #[napi(js_name = "listSessions")]
    pub fn list_sessions(&self) -> NapiResult<Vec<WorkspaceSession>> {
        let state = self.lock_state()?;
        let mut sessions: Vec<WorkspaceSession> = state.sessions.values().cloned().collect();
        sessions.sort_by_key(|session| session.created_at);
        Ok(sessions)
    }

    #[napi(js_name = "requestApproval")]
    pub fn request_approval(&self, request: ApprovalRequestInput) -> NapiResult<ApprovalRequest> {
        let mut state = self.lock_state()?;
        let request_id = request.request_id.unwrap_or_else(|| state.next_approval_id());
        if state.approvals.contains_key(&request_id) {
            return Err(napi_error("Approval request already exists"));
        }

        let requested_at = now_ms();
        let expires_at = request.timeout_ms.map(|timeout| requested_at + timeout);
        let approval = ApprovalRequest {
            request_id: request_id.clone(),
            kind: request.kind,
            payload: normalize_payload(request.payload),
            requested_at,
            timeout_ms: request.timeout_ms,
        };

        state.approvals.insert(
            request_id.clone(),
            ApprovalRecord {
                status: "pending".to_string(),
                expires_at,
            },
        );
        state.pending_approvals += 1;
        Ok(approval)
    }

    #[napi(js_name = "resolveApproval")]
    pub fn resolve_approval(&self, decision: ApprovalDecisionInput) -> NapiResult<ApprovalDecision> {
        let mut state = self.lock_state()?;
        let record = state
            .approvals
            .remove(&decision.request_id)
            .ok_or_else(|| napi_error("Approval request not found"))?;

        let now = now_ms();
        if record
            .expires_at
            .map(|expires_at| expires_at <= now)
            .unwrap_or(false)
        {
            if record.status == "pending" && state.pending_approvals > 0 {
                state.pending_approvals -= 1;
            }
            return Ok(ApprovalDecision {
                request_id: decision.request_id,
                status: "expired".to_string(),
                approved: false,
                reason: decision
                    .reason
                    .or_else(|| Some("Approval timed out".to_string())),
            });
        }

        let resolved_status = resolve_approval_status(&decision)?;
        let approved = decision.approved.unwrap_or(resolved_status == "approved");

        if record.status == "pending" && state.pending_approvals > 0 {
            state.pending_approvals -= 1;
        }

        Ok(ApprovalDecision {
            request_id: decision.request_id,
            status: resolved_status,
            approved,
            reason: decision.reason,
        })
    }

    #[napi(js_name = "getSnapshot")]
    pub fn get_snapshot(&self) -> NapiResult<WorkspaceSnapshot> {
        let state = self.lock_state()?;
        let mut sessions: Vec<WorkspaceSession> = state.sessions.values().cloned().collect();
        sessions.sort_by_key(|session| session.created_at);
        Ok(WorkspaceSnapshot {
            sessions,
            event_cursor: state.event_cursor(),
        })
    }

    #[napi(js_name = "reset")]
    pub fn reset(&self) -> NapiResult<()> {
        let mut state = self.lock_state()?;
        *state = WorkspaceState::new();
        Ok(())
    }
}

impl WorkspaceSessionManager {
    fn lock_state(&self) -> NapiResult<std::sync::MutexGuard<'_, WorkspaceState>> {
        self.state.lock().map_err(|_| napi_error("Workspace state lock poisoned"))
    }
}

fn resolve_approval_status(decision: &ApprovalDecisionInput) -> NapiResult<String> {
    if let Some(status) = decision.status.as_ref() {
        if status == "pending" {
            return Err(napi_error("Approval decision cannot be pending"));
        }
        return Ok(status.clone());
    }

    if let Some(approved) = decision.approved {
        return Ok(if approved { "approved" } else { "rejected" }.to_string());
    }

    Err(napi_error("Approval decision requires status or approved"))
}

fn normalize_payload(payload: Value) -> Value {
    if payload.is_object() {
        payload
    } else {
        json!({ "value": payload })
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn napi_error(message: &str) -> NapiError {
    NapiError::from_reason(message.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_manager() -> WorkspaceSessionManager {
        WorkspaceSessionManager::new()
    }

    #[test]
    fn session_lifecycle_transitions_are_valid() {
        let manager = create_manager();
        let created = manager
            .create_session(WorkspaceSessionConfig {
                session_id: None,
                kind: "terminal".to_string(),
                owner_agent_id: None,
            })
            .unwrap();

        assert_eq!(created.status, "created");

        let sessions = manager.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].status, "active");

        manager.pause_session(created.session_id.clone()).unwrap();
        let paused = manager.list_sessions().unwrap();
        assert_eq!(paused[0].status, "paused");

        manager.resume_session(created.session_id.clone()).unwrap();
        let resumed = manager.list_sessions().unwrap();
        assert_eq!(resumed[0].status, "active");

        manager.close_session(created.session_id.clone()).unwrap();
        let closed = manager.list_sessions().unwrap();
        assert_eq!(closed[0].status, "closed");

        let events = manager.drain_events(None, None).unwrap();
        assert!(events.iter().any(|event| event.event_type == "status"));
    }

    #[test]
    fn event_cursor_is_monotonic() {
        let manager = create_manager();
        let created = manager
            .create_session(WorkspaceSessionConfig {
                session_id: None,
                kind: "terminal".to_string(),
                owner_agent_id: None,
            })
            .unwrap();

        manager
            .send_input(created.session_id.clone(), json!({ "input": "hello" }))
            .unwrap();

        let events = manager.drain_events(None, None).unwrap();
        assert!(!events.is_empty());
        for window in events.windows(2) {
            assert!(window[0].sequence < window[1].sequence);
        }

        let last_sequence = events.last().unwrap().sequence;
        let empty = manager.drain_events(Some(last_sequence), None).unwrap();
        assert!(empty.is_empty());

        let snapshot = manager.get_snapshot().unwrap();
        assert_eq!(snapshot.event_cursor, last_sequence);
    }

    #[test]
    fn approvals_block_and_resume_execution() {
        let manager = create_manager();
        let created = manager
            .create_session(WorkspaceSessionConfig {
                session_id: None,
                kind: "terminal".to_string(),
                owner_agent_id: None,
            })
            .unwrap();

        let request = manager
            .request_approval(ApprovalRequestInput {
                request_id: None,
                kind: "tool".to_string(),
                payload: json!({ "action": "write" }),
                timeout_ms: None,
            })
            .unwrap();

        let blocked = manager.send_input(created.session_id.clone(), json!({ "input": "hi" }));
        assert!(blocked.is_err());

        let decision = manager
            .resolve_approval(ApprovalDecisionInput {
                request_id: request.request_id,
                status: Some("approved".to_string()),
                approved: None,
                reason: None,
            })
            .unwrap();
        assert!(decision.approved);

        let unblocked = manager.send_input(created.session_id, json!({ "input": "ok" }));
        assert!(unblocked.is_ok());
    }

    #[test]
    fn approvals_expire_and_unblock() {
        let manager = create_manager();
        let created = manager
            .create_session(WorkspaceSessionConfig {
                session_id: None,
                kind: "terminal".to_string(),
                owner_agent_id: None,
            })
            .unwrap();

        manager
            .request_approval(ApprovalRequestInput {
                request_id: None,
                kind: "tool".to_string(),
                payload: json!({ "action": "write" }),
                timeout_ms: Some(0),
            })
            .unwrap();

        let unblocked = manager.send_input(created.session_id.clone(), json!({ "input": "ok" }));
        assert!(unblocked.is_ok());

        let request = manager
            .request_approval(ApprovalRequestInput {
                request_id: None,
                kind: "tool".to_string(),
                payload: json!({ "action": "read" }),
                timeout_ms: Some(0),
            })
            .unwrap();

        let decision = manager
            .resolve_approval(ApprovalDecisionInput {
                request_id: request.request_id,
                status: None,
                approved: None,
                reason: None,
            })
            .unwrap();

        assert_eq!(decision.status, "expired");
        assert!(!decision.approved);
    }
}
