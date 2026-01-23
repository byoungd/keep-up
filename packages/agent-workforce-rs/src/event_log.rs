use serde_json::Value;

use crate::types::{WorkforceEvent, WorkforceEventType};

pub struct EventLog {
    events: Vec<WorkforceEvent>,
    next_sequence: u64,
    event_version: u32,
    run_id: String,
}

impl EventLog {
    pub fn new(run_id: String, event_version: u32) -> Self {
        Self {
            events: Vec::new(),
            next_sequence: 1,
            event_version,
            run_id,
        }
    }

    pub fn reset(&mut self, run_id: String, event_version: u32) {
        self.events.clear();
        self.next_sequence = 1;
        self.run_id = run_id;
        self.event_version = event_version;
    }

    pub fn record(
        &mut self,
        event_type: WorkforceEventType,
        task_id: Option<String>,
        worker_id: Option<String>,
        logical_time: Option<u64>,
        payload: Option<Value>,
    ) -> WorkforceEvent {
        let event = WorkforceEvent {
            sequence: self.next_sequence,
            event_version: self.event_version,
            run_id: self.run_id.clone(),
            event_type,
            task_id,
            worker_id,
            logical_time,
            payload,
        };
        self.next_sequence += 1;
        self.events.push(event.clone());
        event
    }

    pub fn list(&self, after: Option<u64>, limit: Option<usize>) -> Vec<WorkforceEvent> {
        let start = after.unwrap_or(0);
        let mut collected: Vec<WorkforceEvent> = self
            .events
            .iter()
            .filter(|event| event.sequence > start)
            .cloned()
            .collect();

        if let Some(max) = limit {
            if collected.len() > max {
                collected.truncate(max);
            }
        }

        collected
    }

    pub fn cursor(&self) -> u64 {
        self.next_sequence - 1
    }
}
