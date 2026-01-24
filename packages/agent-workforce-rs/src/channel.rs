use std::collections::BTreeMap;

use serde_json::Value;

use crate::types::{
    TaskChannelMessage, TaskChannelMessageType, WorkforceResultEnvelope, WorkforceTaskSnapshot,
};

pub struct TaskChannel {
    messages: Vec<TaskChannelMessage>,
    next_sequence: u64,
    results: BTreeMap<String, Vec<WorkforceResultEnvelope>>,
}

impl TaskChannel {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            next_sequence: 1,
            results: BTreeMap::new(),
        }
    }

    pub fn reset(&mut self) {
        self.messages.clear();
        self.next_sequence = 1;
        self.results.clear();
    }

    pub fn publish_task(&mut self, task: &WorkforceTaskSnapshot, worker_id: Option<&str>) {
        let payload = serde_json::json!({
            "taskId": task.task_id,
            "title": task.title,
            "requiredCapabilities": task.required_capabilities,
            "attempt": task.attempt,
            "workerId": worker_id,
            "priority": task.priority,
        });
        self.push_message(TaskChannelMessageType::Task, task.task_id.clone(), payload);
    }

    pub fn publish_result(&mut self, result: WorkforceResultEnvelope) {
        let entry = self.results.entry(result.task_id.clone()).or_default();
        entry.push(result.clone());

        let payload = serde_json::to_value(&result).unwrap_or(Value::Null);
        self.push_message(TaskChannelMessageType::Result, result.task_id, payload);
    }

    pub fn list_messages(
        &self,
        after: Option<u64>,
        limit: Option<usize>,
    ) -> Vec<TaskChannelMessage> {
        let start = after.unwrap_or(0);
        let mut collected: Vec<TaskChannelMessage> = self
            .messages
            .iter()
            .filter(|message| message.sequence > start)
            .cloned()
            .collect();

        if let Some(max) = limit {
            if collected.len() > max {
                collected.truncate(max);
            }
        }

        collected
    }

    #[allow(dead_code)]
    pub fn get_results(&self, task_id: &str) -> Vec<WorkforceResultEnvelope> {
        self.results.get(task_id).cloned().unwrap_or_default()
    }

    pub fn cursor(&self) -> u64 {
        self.next_sequence - 1
    }

    fn push_message(
        &mut self,
        message_type: TaskChannelMessageType,
        task_id: String,
        payload: Value,
    ) {
        let message = TaskChannelMessage {
            sequence: self.next_sequence,
            message_type,
            task_id,
            payload,
        };
        self.next_sequence += 1;
        self.messages.push(message);
    }
}
