mod channel;
mod engine;
mod event_log;
mod planner;
mod types;

pub use engine::{WorkforceEngine, WorkforceError};
pub use planner::{Planner, StaticPlanner};
pub use types::{
    FailurePolicy, WorkforcePlanInput, WorkforceResultEnvelope, WorkforceRuntimeConfig,
    WorkforceTaskInput, WorkforceWorkerRegistration,
};

use napi::bindgen_prelude::Result;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::Value;

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

fn parse_input<T: DeserializeOwned>(value: Value, label: &str) -> Result<T> {
    serde_json::from_value(value)
        .map_err(|error| to_napi_error(format!("Invalid {label}: {error}")))
}

fn parse_non_negative(value: i64, label: &str) -> Result<u64> {
    if value < 0 {
        return Err(to_napi_error(format!(
            "{label} must be non-negative, received {value}"
        )));
    }
    Ok(value as u64)
}

#[napi(js_name = "WorkforceOrchestrator")]
pub struct WorkforceOrchestratorBinding {
    engine: WorkforceEngine,
}

#[napi]
impl WorkforceOrchestratorBinding {
    #[napi(constructor)]
    pub fn new(config: Option<Value>) -> Result<Self> {
        let config = match config {
            Some(value) => parse_input::<WorkforceRuntimeConfig>(value, "workforce config")?,
            None => WorkforceRuntimeConfig {
                run_id: None,
                event_version: None,
                failure_policy: None,
            },
        };
        Ok(Self {
            engine: WorkforceEngine::new(config),
        })
    }

    #[napi(js_name = "loadPlan")]
    pub fn load_plan(&mut self, plan: Value) -> Result<()> {
        let plan = parse_input::<WorkforcePlanInput>(plan, "workforce plan")?;
        self.engine.load_plan(plan).map_err(to_napi_error)
    }

    #[napi(js_name = "registerWorker")]
    pub fn register_worker(&mut self, worker: Value) -> Result<()> {
        let worker = parse_input::<WorkforceWorkerRegistration>(worker, "worker registration")?;
        self.engine.register_worker(worker).map_err(to_napi_error)
    }

    #[napi(js_name = "registerWorkers")]
    pub fn register_workers(&mut self, workers: Vec<Value>) -> Result<()> {
        let mut parsed = Vec::with_capacity(workers.len());
        for worker in workers {
            parsed.push(parse_input::<WorkforceWorkerRegistration>(
                worker,
                "worker registration",
            )?);
        }
        self.engine.register_workers(parsed).map_err(to_napi_error)
    }

    #[napi]
    pub fn schedule(&mut self, now_ms: Option<i64>) -> Result<Value> {
        let now_ms = match now_ms {
            Some(value) => Some(parse_non_negative(value, "nowMs")?),
            None => None,
        };
        let assignments = self.engine.schedule(now_ms).map_err(to_napi_error)?;
        serde_json::to_value(assignments).map_err(to_napi_error)
    }

    #[napi(js_name = "submitResult")]
    pub fn submit_result(&mut self, result: Value, now_ms: Option<i64>) -> Result<()> {
        let result = parse_input::<WorkforceResultEnvelope>(result, "result envelope")?;
        let now_ms = match now_ms {
            Some(value) => Some(parse_non_negative(value, "nowMs")?),
            None => None,
        };
        self.engine
            .submit_result(result, now_ms)
            .map_err(to_napi_error)
    }

    #[napi(js_name = "cancelTask")]
    pub fn cancel_task(&mut self, task_id: String, reason: Option<String>) -> Result<()> {
        self.engine
            .cancel_task(&task_id, reason)
            .map_err(to_napi_error)
    }

    #[napi(js_name = "listTasks")]
    pub fn list_tasks(&self) -> Result<Value> {
        serde_json::to_value(self.engine.list_tasks()).map_err(to_napi_error)
    }

    #[napi(js_name = "listWorkers")]
    pub fn list_workers(&self) -> Result<Value> {
        serde_json::to_value(self.engine.list_workers()).map_err(to_napi_error)
    }

    #[napi(js_name = "drainEvents")]
    pub fn drain_events(&self, after: Option<i64>, limit: Option<u32>) -> Result<Value> {
        let after = match after {
            Some(value) => Some(parse_non_negative(value, "after")?),
            None => None,
        };
        let events = self
            .engine
            .drain_events(after, limit.map(|value| value as usize));
        serde_json::to_value(events).map_err(to_napi_error)
    }

    #[napi(js_name = "listChannelMessages")]
    pub fn list_channel_messages(&self, after: Option<i64>, limit: Option<u32>) -> Result<Value> {
        let after = match after {
            Some(value) => Some(parse_non_negative(value, "after")?),
            None => None,
        };
        let messages = self
            .engine
            .list_channel_messages(after, limit.map(|value| value as usize));
        serde_json::to_value(messages).map_err(to_napi_error)
    }

    #[napi(js_name = "getSnapshot")]
    pub fn get_snapshot(&self) -> Result<Value> {
        serde_json::to_value(self.engine.get_snapshot()).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset(&mut self) {
        self.engine.reset();
    }
}

impl From<WorkforceError> for napi::Error {
    fn from(error: WorkforceError) -> Self {
        to_napi_error(error)
    }
}
