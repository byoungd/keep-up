use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running,
    Blocked,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskBlockReason {
    Dependencies,
    Backoff,
    Escalated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkerState {
    Idle,
    Busy,
    Draining,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkforceResultStatus {
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailurePolicy {
    pub retry_count: u32,
    pub backoff_ms: u64,
    pub escalate_after: u32,
}

impl Default for FailurePolicy {
    fn default() -> Self {
        Self {
            retry_count: 2,
            backoff_ms: 1_000,
            escalate_after: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceRuntimeConfig {
    pub run_id: Option<String>,
    pub event_version: Option<u32>,
    pub failure_policy: Option<FailurePolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceTaskInput {
    pub task_id: String,
    pub title: String,
    pub required_capabilities: Option<Vec<String>>,
    pub depends_on: Option<Vec<String>>,
    pub priority: Option<u32>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforcePlanInput {
    pub plan_id: String,
    pub goal: Option<String>,
    pub tasks: Vec<WorkforceTaskInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceWorkerRegistration {
    pub worker_id: String,
    pub capabilities: Vec<String>,
    pub capacity: u32,
    pub state: Option<WorkerState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceResultEnvelope {
    pub task_id: String,
    pub worker_id: String,
    pub status: WorkforceResultStatus,
    pub output: Option<Value>,
    pub error: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceAssignment {
    pub task_id: String,
    pub worker_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkforceEventType {
    PlanCreated,
    TaskQueued,
    TaskAssigned,
    TaskStarted,
    TaskBlocked,
    TaskCompleted,
    TaskFailed,
    TaskCanceled,
    TaskRetryScheduled,
    TaskEscalated,
    TaskDeadLettered,
    WorkerRegistered,
    ResultPublished,
    SchedulerTick,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceEvent {
    pub sequence: u64,
    pub event_version: u32,
    pub run_id: String,
    #[serde(rename = "type")]
    pub event_type: WorkforceEventType,
    pub task_id: Option<String>,
    pub worker_id: Option<String>,
    pub logical_time: Option<u64>,
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskChannelMessageType {
    Task,
    Result,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskChannelMessage {
    pub sequence: u64,
    #[serde(rename = "type")]
    pub message_type: TaskChannelMessageType,
    pub task_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceTaskSnapshot {
    pub task_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub depends_on: Vec<String>,
    pub required_capabilities: Vec<String>,
    pub attempt: u32,
    pub priority: u32,
    pub assigned_worker_id: Option<String>,
    pub blocked_until: Option<u64>,
    pub blocked_reason: Option<TaskBlockReason>,
    pub metadata: Option<Value>,
    pub result: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceWorkerSnapshot {
    pub worker_id: String,
    pub capabilities: Vec<String>,
    pub capacity: u32,
    pub active_count: u32,
    pub state: WorkerState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkforceSnapshot {
    pub run_id: String,
    pub plan_id: Option<String>,
    pub goal: Option<String>,
    pub tasks: Vec<WorkforceTaskSnapshot>,
    pub workers: Vec<WorkforceWorkerSnapshot>,
    pub event_cursor: u64,
    pub channel_cursor: u64,
}
