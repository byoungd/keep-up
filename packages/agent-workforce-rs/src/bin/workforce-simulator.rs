use std::env;
use std::fs;

use serde::Deserialize;
use serde_json::json;

use agent_workforce_rs::{
    WorkforceEngine, WorkforcePlanInput, WorkforceResultEnvelope, WorkforceRuntimeConfig,
    WorkforceWorkerRegistration,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkforceScenario {
    config: Option<WorkforceRuntimeConfig>,
    plan: WorkforcePlanInput,
    workers: Vec<WorkforceWorkerRegistration>,
    actions: Vec<ScenarioAction>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ScenarioAction {
    Schedule {
        #[serde(rename = "nowMs")]
        now_ms: Option<u64>,
    },
    Result {
        result: WorkforceResultEnvelope,
        #[serde(rename = "nowMs")]
        now_ms: Option<u64>,
    },
    Cancel {
        #[serde(rename = "taskId")]
        task_id: String,
        reason: Option<String>,
    },
}

fn default_config() -> WorkforceRuntimeConfig {
    WorkforceRuntimeConfig {
        run_id: None,
        event_version: None,
        failure_policy: None,
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args()
        .nth(1)
        .ok_or("Usage: workforce-simulator <scenario.json>")?;
    let payload = fs::read_to_string(path)?;
    let scenario: WorkforceScenario = serde_json::from_str(&payload)?;

    let config = scenario.config.unwrap_or_else(default_config);
    let mut engine = WorkforceEngine::new(config);
    engine.load_plan(scenario.plan)?;
    engine.register_workers(scenario.workers)?;

    for action in scenario.actions {
        match action {
            ScenarioAction::Schedule { now_ms } => {
                let assignments = engine.schedule(now_ms)?;
                if !assignments.is_empty() {
                    println!("{}", serde_json::to_string(&assignments)?);
                }
            }
            ScenarioAction::Result { result, now_ms } => {
                engine.submit_result(result, now_ms)?;
            }
            ScenarioAction::Cancel { task_id, reason } => {
                engine.cancel_task(&task_id, reason)?;
            }
        }
    }

    let snapshot = engine.get_snapshot();
    let events = engine.drain_events(None, None);
    let channel = engine.list_channel_messages(None, None);

    let output = json!({
        "snapshot": snapshot,
        "events": events,
        "channel": channel,
    });

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
