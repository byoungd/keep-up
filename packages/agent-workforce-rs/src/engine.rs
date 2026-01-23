use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};

use crate::channel::TaskChannel;
use crate::event_log::EventLog;
use crate::types::{
    FailurePolicy, TaskBlockReason, TaskStatus, WorkerState, WorkforceAssignment,
    WorkforceEventType, WorkforcePlanInput, WorkforceResultEnvelope, WorkforceResultStatus,
    WorkforceRuntimeConfig, WorkforceSnapshot, WorkforceTaskInput, WorkforceTaskSnapshot,
    WorkforceWorkerRegistration, WorkforceWorkerSnapshot,
};

#[derive(Debug)]
pub enum WorkforceError {
    PlanNotLoaded,
    DuplicateTask(String),
    MissingDependency { task_id: String, dependency: String },
    CycleDetected(String),
    TaskNotFound(String),
    WorkerNotFound(String),
    InvalidResult(String),
    InvalidTime(String),
}

impl std::fmt::Display for WorkforceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PlanNotLoaded => write!(f, "Plan not loaded"),
            Self::DuplicateTask(task_id) => write!(f, "Duplicate task id: {task_id}"),
            Self::MissingDependency {
                task_id,
                dependency,
            } => {
                write!(f, "Task {task_id} depends on missing task {dependency}")
            }
            Self::CycleDetected(task_id) => write!(f, "Cycle detected at task {task_id}"),
            Self::TaskNotFound(task_id) => write!(f, "Task not found: {task_id}"),
            Self::WorkerNotFound(worker_id) => write!(f, "Worker not found: {worker_id}"),
            Self::InvalidResult(message) => write!(f, "Invalid result: {message}"),
            Self::InvalidTime(message) => write!(f, "Invalid logical time: {message}"),
        }
    }
}

impl std::error::Error for WorkforceError {}

#[derive(Debug, Clone)]
struct TaskNode {
    task_id: String,
    title: String,
    required_capabilities: Vec<String>,
    depends_on: Vec<String>,
    status: TaskStatus,
    attempt: u32,
    failure_count: u32,
    priority: u32,
    sequence: u64,
    assigned_worker_id: Option<String>,
    blocked_until: Option<u64>,
    blocked_reason: Option<TaskBlockReason>,
    metadata: Option<Value>,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct WorkerEntry {
    worker_id: String,
    capabilities: Vec<String>,
    capacity: u32,
    active_count: u32,
    state: WorkerState,
}

impl WorkerEntry {
    fn update_state(&mut self) {
        if self.state == WorkerState::Draining {
            return;
        }
        self.state = if self.active_count > 0 {
            WorkerState::Busy
        } else {
            WorkerState::Idle
        };
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VisitState {
    Visiting,
    Visited,
}

pub struct WorkforceEngine {
    run_id: String,
    plan_id: Option<String>,
    goal: Option<String>,
    failure_policy: FailurePolicy,
    event_version: u32,
    event_log: EventLog,
    channel: TaskChannel,
    tasks: BTreeMap<String, TaskNode>,
    dependents: BTreeMap<String, Vec<String>>,
    workers: BTreeMap<String, WorkerEntry>,
    dead_letters: Vec<String>,
    logical_time: u64,
}

impl WorkforceEngine {
    pub fn new(config: WorkforceRuntimeConfig) -> Self {
        let run_id = config.run_id.unwrap_or_else(|| "workforce-run".to_string());
        let event_version = config.event_version.unwrap_or(1);
        let failure_policy = config.failure_policy.unwrap_or_default();
        Self {
            run_id: run_id.clone(),
            plan_id: None,
            goal: None,
            failure_policy,
            event_version,
            event_log: EventLog::new(run_id, event_version),
            channel: TaskChannel::new(),
            tasks: BTreeMap::new(),
            dependents: BTreeMap::new(),
            workers: BTreeMap::new(),
            dead_letters: Vec::new(),
            logical_time: 0,
        }
    }

    pub fn reset(&mut self) {
        self.plan_id = None;
        self.goal = None;
        self.tasks.clear();
        self.dependents.clear();
        self.workers.clear();
        self.dead_letters.clear();
        self.channel.reset();
        self.logical_time = 0;
        let run_id = self.run_id.clone();
        self.event_log.reset(run_id, self.event_version);
    }

    pub fn load_plan(&mut self, plan: WorkforcePlanInput) -> Result<(), WorkforceError> {
        let plan_id = plan.plan_id.clone();
        let goal = plan.goal.clone();
        self.plan_id = Some(plan_id.clone());
        self.goal = goal.clone();
        self.tasks.clear();
        self.dependents.clear();
        self.channel.reset();
        self.dead_letters.clear();
        self.logical_time = 0;
        self.event_log
            .reset(self.run_id.clone(), self.event_version);

        let mut sequence = 0_u64;
        for input in plan.tasks {
            if self.tasks.contains_key(&input.task_id) {
                return Err(WorkforceError::DuplicateTask(input.task_id));
            }
            sequence += 1;
            let task = TaskNode::from_input(input, sequence);
            self.tasks.insert(task.task_id.clone(), task);
        }

        self.validate_plan()?;
        self.dependents = build_dependents(&self.tasks);

        let logical_time = self.resolve_time(None)?;
        self.event_log.record(
            WorkforceEventType::PlanCreated,
            None,
            None,
            Some(logical_time),
            Some(json!({ "planId": plan_id, "goal": goal })),
        );

        let mut task_ids: Vec<String> = self.tasks.keys().cloned().collect();
        task_ids.sort();

        for task_id in task_ids {
            let (task_id, event_type, payload, snapshot) = {
                let task = self.tasks.get_mut(&task_id).expect("task exists");
                if task.depends_on.is_empty() {
                    task.status = TaskStatus::Queued;
                    task.blocked_reason = None;
                    (
                        task.task_id.clone(),
                        WorkforceEventType::TaskQueued,
                        Some(json!({ "reason": "plan_load" })),
                        Some(snapshot_task(task)),
                    )
                } else {
                    task.status = TaskStatus::Blocked;
                    task.blocked_reason = Some(TaskBlockReason::Dependencies);
                    (
                        task.task_id.clone(),
                        WorkforceEventType::TaskBlocked,
                        Some(json!({ "reason": "dependencies" })),
                        None,
                    )
                }
            };

            self.record_task_event(event_type, &task_id, None, Some(logical_time), payload);
            if let Some(snapshot) = snapshot {
                self.channel.publish_task(&snapshot, None);
            }
        }

        Ok(())
    }

    pub fn register_worker(
        &mut self,
        registration: WorkforceWorkerRegistration,
    ) -> Result<(), WorkforceError> {
        let worker = WorkerEntry::from_registration(registration);
        self.workers
            .insert(worker.worker_id.clone(), worker.clone());
        let logical_time = self.resolve_time(None)?;
        self.event_log.record(
            WorkforceEventType::WorkerRegistered,
            None,
            Some(worker.worker_id),
            Some(logical_time),
            Some(json!({ "capacity": worker.capacity, "state": worker.state })),
        );
        Ok(())
    }

    pub fn register_workers(
        &mut self,
        workers: Vec<WorkforceWorkerRegistration>,
    ) -> Result<(), WorkforceError> {
        for worker in workers {
            self.register_worker(worker)?;
        }
        Ok(())
    }

    pub fn schedule(
        &mut self,
        now_ms: Option<u64>,
    ) -> Result<Vec<WorkforceAssignment>, WorkforceError> {
        self.ensure_plan_loaded()?;
        let logical_time = self.resolve_time(now_ms)?;
        self.event_log.record(
            WorkforceEventType::SchedulerTick,
            None,
            None,
            Some(logical_time),
            None,
        );

        self.refresh_blocked_tasks(logical_time)?;

        let mut ready_tasks = self.collect_ready_tasks();
        if ready_tasks.is_empty() {
            return Ok(Vec::new());
        }

        let assignments = Coordinator::assign(&mut ready_tasks, &self.workers, &self.tasks);
        if assignments.is_empty() {
            return Ok(Vec::new());
        }

        for assignment in &assignments {
            let task_update = self.tasks.get_mut(&assignment.task_id).map(|task| {
                task.status = TaskStatus::Running;
                task.assigned_worker_id = Some(assignment.worker_id.clone());
                task.attempt = task.attempt.saturating_add(1);
                task.blocked_reason = None;
                task.blocked_until = None;
                (task.task_id.clone(), task.attempt, task.priority)
            });

            if let Some((task_id, attempt, priority)) = task_update {
                self.record_task_event(
                    WorkforceEventType::TaskAssigned,
                    &task_id,
                    Some(&assignment.worker_id),
                    Some(logical_time),
                    Some(json!({ "attempt": attempt, "priority": priority })),
                );
                self.record_task_event(
                    WorkforceEventType::TaskStarted,
                    &task_id,
                    Some(&assignment.worker_id),
                    Some(logical_time),
                    Some(json!({ "attempt": attempt })),
                );
            }

            if let Some(worker) = self.workers.get_mut(&assignment.worker_id) {
                worker.active_count = worker.active_count.saturating_add(1);
                worker.update_state();
            }
        }

        Ok(assignments)
    }

    pub fn submit_result(
        &mut self,
        result: WorkforceResultEnvelope,
        now_ms: Option<u64>,
    ) -> Result<(), WorkforceError> {
        self.ensure_plan_loaded()?;
        let logical_time = self.resolve_time(now_ms)?;
        let mut actions: Vec<(WorkforceEventType, Option<String>, Option<Value>)> = Vec::new();
        let mut mark_dependents = false;
        let mut dead_letter = false;
        let task_id = result.task_id.clone();
        let worker_id = result.worker_id.clone();

        if let Some(task) = self.tasks.get_mut(&result.task_id) {
            if task.assigned_worker_id.as_deref() != Some(result.worker_id.as_str()) {
                return Err(WorkforceError::InvalidResult(format!(
                    "Task {} is not assigned to worker {}",
                    task.task_id, result.worker_id
                )));
            }

            match result.status {
                WorkforceResultStatus::Completed => {
                    task.status = TaskStatus::Completed;
                    task.result = result.output.clone();
                    task.error = None;
                    task.assigned_worker_id = None;
                    actions.push((
                        WorkforceEventType::TaskCompleted,
                        Some(worker_id.clone()),
                        Some(json!({ "attempt": task.attempt })),
                    ));
                    mark_dependents = true;
                }
                WorkforceResultStatus::Failed => {
                    task.failure_count = task.failure_count.saturating_add(1);
                    task.error = result.error.clone();
                    task.assigned_worker_id = None;
                    actions.push((
                        WorkforceEventType::TaskFailed,
                        Some(worker_id.clone()),
                        Some(json!({ "attempt": task.attempt })),
                    ));

                    if task.attempt <= self.failure_policy.retry_count {
                        let backoff = self
                            .failure_policy
                            .backoff_ms
                            .saturating_mul(task.attempt.max(1) as u64);
                        task.status = TaskStatus::Blocked;
                        task.blocked_reason = Some(TaskBlockReason::Backoff);
                        task.blocked_until = Some(logical_time.saturating_add(backoff));
                        actions.push((
                            WorkforceEventType::TaskRetryScheduled,
                            None,
                            Some(json!({ "backoffMs": backoff, "nextAttempt": task.attempt + 1 })),
                        ));
                    } else if self.failure_policy.escalate_after > 0
                        && task.failure_count >= self.failure_policy.escalate_after
                    {
                        task.status = TaskStatus::Blocked;
                        task.blocked_reason = Some(TaskBlockReason::Escalated);
                        actions.push((
                            WorkforceEventType::TaskEscalated,
                            None,
                            Some(json!({ "failures": task.failure_count })),
                        ));
                    } else {
                        task.status = TaskStatus::Failed;
                        dead_letter = true;
                        actions.push((
                            WorkforceEventType::TaskDeadLettered,
                            None,
                            Some(json!({ "failures": task.failure_count })),
                        ));
                    }
                }
                WorkforceResultStatus::Canceled => {
                    task.status = TaskStatus::Canceled;
                    task.assigned_worker_id = None;
                    task.error = result.error.clone();
                    actions.push((
                        WorkforceEventType::TaskCanceled,
                        Some(worker_id.clone()),
                        Some(json!({ "attempt": task.attempt })),
                    ));
                }
            }
        } else {
            return Err(WorkforceError::TaskNotFound(result.task_id));
        }

        let worker = self
            .workers
            .get_mut(&result.worker_id)
            .ok_or_else(|| WorkforceError::WorkerNotFound(result.worker_id.clone()))?;
        worker.active_count = worker.active_count.saturating_sub(1);
        worker.update_state();

        if dead_letter && !self.dead_letters.contains(&task_id) {
            self.dead_letters.push(task_id.clone());
        }

        for (event_type, worker, payload) in actions {
            self.record_task_event(
                event_type,
                &task_id,
                worker.as_deref(),
                Some(logical_time),
                payload,
            );
        }

        self.channel.publish_result(result.clone());
        self.event_log.record(
            WorkforceEventType::ResultPublished,
            Some(task_id.clone()),
            Some(worker_id),
            Some(logical_time),
            None,
        );

        if mark_dependents {
            self.mark_dependents_ready(&task_id, logical_time)?;
        }

        Ok(())
    }

    pub fn cancel_task(
        &mut self,
        task_id: &str,
        reason: Option<String>,
    ) -> Result<(), WorkforceError> {
        self.ensure_plan_loaded()?;
        let logical_time = self.resolve_time(None)?;
        let task_id = {
            let task = self
                .tasks
                .get_mut(task_id)
                .ok_or_else(|| WorkforceError::TaskNotFound(task_id.to_string()))?;
            task.status = TaskStatus::Canceled;
            task.error = reason;
            task.assigned_worker_id = None;
            task.task_id.clone()
        };
        self.record_task_event(
            WorkforceEventType::TaskCanceled,
            &task_id,
            None,
            Some(logical_time),
            None,
        );
        Ok(())
    }

    pub fn list_tasks(&self) -> Vec<WorkforceTaskSnapshot> {
        let mut snapshots: Vec<WorkforceTaskSnapshot> =
            self.tasks.values().map(snapshot_task).collect();
        snapshots.sort_by(|a, b| {
            a.priority
                .cmp(&b.priority)
                .then_with(|| a.task_id.cmp(&b.task_id))
        });
        snapshots
    }

    pub fn list_workers(&self) -> Vec<WorkforceWorkerSnapshot> {
        let mut workers: Vec<WorkforceWorkerSnapshot> = self
            .workers
            .values()
            .map(|worker| WorkforceWorkerSnapshot {
                worker_id: worker.worker_id.clone(),
                capabilities: worker.capabilities.clone(),
                capacity: worker.capacity,
                active_count: worker.active_count,
                state: worker.state,
            })
            .collect();
        workers.sort_by(|a, b| a.worker_id.cmp(&b.worker_id));
        workers
    }

    pub fn drain_events(
        &self,
        after: Option<u64>,
        limit: Option<usize>,
    ) -> Vec<crate::types::WorkforceEvent> {
        self.event_log.list(after, limit)
    }

    pub fn list_channel_messages(
        &self,
        after: Option<u64>,
        limit: Option<usize>,
    ) -> Vec<crate::types::TaskChannelMessage> {
        self.channel.list_messages(after, limit)
    }

    pub fn get_snapshot(&self) -> WorkforceSnapshot {
        WorkforceSnapshot {
            run_id: self.run_id.clone(),
            plan_id: self.plan_id.clone(),
            goal: self.goal.clone(),
            tasks: self.list_tasks(),
            workers: self.list_workers(),
            event_cursor: self.event_log.cursor(),
            channel_cursor: self.channel.cursor(),
        }
    }

    fn ensure_plan_loaded(&self) -> Result<(), WorkforceError> {
        if self.plan_id.is_none() {
            return Err(WorkforceError::PlanNotLoaded);
        }
        Ok(())
    }

    fn resolve_time(&mut self, now_ms: Option<u64>) -> Result<u64, WorkforceError> {
        let resolved = if let Some(now) = now_ms {
            if now < self.logical_time {
                return Err(WorkforceError::InvalidTime(format!(
                    "{now} < {current}",
                    current = self.logical_time
                )));
            }
            now
        } else {
            self.logical_time.saturating_add(1)
        };
        self.logical_time = resolved;
        Ok(resolved)
    }

    fn validate_plan(&self) -> Result<(), WorkforceError> {
        for (task_id, task) in &self.tasks {
            for dependency in &task.depends_on {
                if !self.tasks.contains_key(dependency) {
                    return Err(WorkforceError::MissingDependency {
                        task_id: task_id.clone(),
                        dependency: dependency.clone(),
                    });
                }
            }
        }

        let mut state: BTreeMap<String, VisitState> = BTreeMap::new();
        for task_id in self.tasks.keys() {
            if !state.contains_key(task_id) {
                self.visit(task_id, &mut state)?;
            }
        }
        Ok(())
    }

    fn visit(
        &self,
        task_id: &str,
        state: &mut BTreeMap<String, VisitState>,
    ) -> Result<(), WorkforceError> {
        state.insert(task_id.to_string(), VisitState::Visiting);
        let task = self.tasks.get(task_id).expect("task exists");
        for dependency in &task.depends_on {
            match state.get(dependency) {
                Some(VisitState::Visiting) => {
                    return Err(WorkforceError::CycleDetected(dependency.clone()));
                }
                Some(VisitState::Visited) => continue,
                None => {
                    self.visit(dependency, state)?;
                }
            }
        }
        state.insert(task_id.to_string(), VisitState::Visited);
        Ok(())
    }

    fn refresh_blocked_tasks(&mut self, now: u64) -> Result<(), WorkforceError> {
        let mut to_unblock: Vec<String> = Vec::new();
        for (task_id, task) in &self.tasks {
            if task.status != TaskStatus::Blocked {
                continue;
            }
            match task.blocked_reason {
                Some(TaskBlockReason::Backoff) => {
                    if let Some(until) = task.blocked_until {
                        if until <= now {
                            to_unblock.push(task_id.clone());
                        }
                    }
                }
                Some(TaskBlockReason::Dependencies) => {
                    if self.dependencies_completed(task) {
                        to_unblock.push(task_id.clone());
                    }
                }
                _ => {}
            }
        }

        let mut actions: Vec<(String, WorkforceTaskSnapshot)> = Vec::new();
        for task_id in to_unblock {
            if let Some(task) = self.tasks.get_mut(&task_id) {
                task.status = TaskStatus::Queued;
                task.blocked_reason = None;
                task.blocked_until = None;
                actions.push((task.task_id.clone(), snapshot_task(task)));
            }
        }

        for (task_id, snapshot) in actions {
            self.record_task_event(
                WorkforceEventType::TaskQueued,
                &task_id,
                None,
                Some(now),
                Some(json!({ "reason": "unblocked" })),
            );
            self.channel.publish_task(&snapshot, None);
        }

        Ok(())
    }

    fn collect_ready_tasks(&self) -> Vec<String> {
        let mut candidates: Vec<&TaskNode> = self
            .tasks
            .values()
            .filter(|task| task.status == TaskStatus::Queued)
            .filter(|task| self.dependencies_completed(task))
            .collect();

        candidates.sort_by(|a, b| {
            a.priority
                .cmp(&b.priority)
                .then_with(|| a.sequence.cmp(&b.sequence))
                .then_with(|| a.task_id.cmp(&b.task_id))
        });

        candidates
            .into_iter()
            .map(|task| task.task_id.clone())
            .collect()
    }

    fn dependencies_completed(&self, task: &TaskNode) -> bool {
        for dependency in &task.depends_on {
            let Some(dep_task) = self.tasks.get(dependency) else {
                return false;
            };
            if dep_task.status != TaskStatus::Completed {
                return false;
            }
        }
        true
    }

    fn record_task_event(
        &mut self,
        event_type: WorkforceEventType,
        task_id: &str,
        worker_id: Option<&str>,
        logical_time: Option<u64>,
        payload: Option<Value>,
    ) {
        self.event_log.record(
            event_type,
            Some(task_id.to_string()),
            worker_id.map(|id| id.to_string()),
            logical_time,
            payload,
        );
    }

    fn mark_dependents_ready(&mut self, task_id: &str, now: u64) -> Result<(), WorkforceError> {
        let dependents = self.dependents.get(task_id).cloned().unwrap_or_default();

        for dependent_id in dependents {
            let ready = match self.tasks.get(&dependent_id) {
                Some(task) => {
                    task.status == TaskStatus::Blocked
                        && task.blocked_reason == Some(TaskBlockReason::Dependencies)
                        && self.dependencies_completed(task)
                }
                None => false,
            };

            if !ready {
                continue;
            }

            let action = self.tasks.get_mut(&dependent_id).map(|task| {
                task.status = TaskStatus::Queued;
                task.blocked_reason = None;
                task.blocked_until = None;
                (task.task_id.clone(), snapshot_task(task))
            });

            if let Some((queued_id, snapshot)) = action {
                self.record_task_event(
                    WorkforceEventType::TaskQueued,
                    &queued_id,
                    None,
                    Some(now),
                    Some(json!({ "reason": "dependencies_resolved" })),
                );
                self.channel.publish_task(&snapshot, None);
            }
        }

        Ok(())
    }
}

fn snapshot_task(task: &TaskNode) -> WorkforceTaskSnapshot {
    WorkforceTaskSnapshot {
        task_id: task.task_id.clone(),
        title: task.title.clone(),
        status: task.status,
        depends_on: task.depends_on.clone(),
        required_capabilities: task.required_capabilities.clone(),
        attempt: task.attempt,
        priority: task.priority,
        assigned_worker_id: task.assigned_worker_id.clone(),
        blocked_until: task.blocked_until,
        blocked_reason: task.blocked_reason,
        metadata: task.metadata.clone(),
        result: task.result.clone(),
        error: task.error.clone(),
    }
}

impl TaskNode {
    fn from_input(input: WorkforceTaskInput, sequence: u64) -> Self {
        let mut required = input.required_capabilities.unwrap_or_default();
        required.sort();
        required.dedup();

        let mut depends_on = input.depends_on.unwrap_or_default();
        depends_on.sort();
        depends_on.dedup();

        Self {
            task_id: input.task_id,
            title: input.title,
            required_capabilities: required,
            depends_on,
            status: TaskStatus::Queued,
            attempt: 0,
            failure_count: 0,
            priority: input.priority.unwrap_or(0),
            sequence,
            assigned_worker_id: None,
            blocked_until: None,
            blocked_reason: None,
            metadata: input.metadata,
            result: None,
            error: None,
        }
    }
}

impl WorkerEntry {
    fn from_registration(registration: WorkforceWorkerRegistration) -> Self {
        let mut capabilities = registration.capabilities;
        capabilities.sort();
        capabilities.dedup();

        Self {
            worker_id: registration.worker_id,
            capabilities,
            capacity: registration.capacity.max(1),
            active_count: 0,
            state: registration.state.unwrap_or(WorkerState::Idle),
        }
    }
}

fn build_dependents(tasks: &BTreeMap<String, TaskNode>) -> BTreeMap<String, Vec<String>> {
    let mut dependents: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (task_id, task) in tasks {
        for dependency in &task.depends_on {
            dependents
                .entry(dependency.clone())
                .or_default()
                .insert(task_id.clone());
        }
    }

    let mut resolved: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (dependency, dependent_set) in dependents {
        let mut list: Vec<String> = dependent_set.into_iter().collect();
        list.sort();
        resolved.insert(dependency, list);
    }

    resolved
}

struct Coordinator;

impl Coordinator {
    fn assign(
        ready_tasks: &mut Vec<String>,
        workers: &BTreeMap<String, WorkerEntry>,
        tasks: &BTreeMap<String, TaskNode>,
    ) -> Vec<WorkforceAssignment> {
        let mut worker_list: Vec<&WorkerEntry> = workers
            .values()
            .filter(|worker| worker.state != WorkerState::Draining)
            .collect();
        worker_list.sort_by(|a, b| {
            a.active_count
                .cmp(&b.active_count)
                .then_with(|| a.worker_id.cmp(&b.worker_id))
        });

        let mut assignments = Vec::new();
        for worker in worker_list {
            let available = worker.capacity.saturating_sub(worker.active_count);
            if available == 0 {
                continue;
            }
            let mut remaining = available;
            while remaining > 0 {
                let Some((index, task_id)) =
                    find_matching_task(ready_tasks, &worker.capabilities, tasks)
                else {
                    break;
                };
                ready_tasks.remove(index);
                assignments.push(WorkforceAssignment {
                    task_id,
                    worker_id: worker.worker_id.clone(),
                });
                remaining -= 1;
                if ready_tasks.is_empty() {
                    break;
                }
            }
            if ready_tasks.is_empty() {
                break;
            }
        }

        assignments
    }
}

fn find_matching_task(
    ready_tasks: &[String],
    worker_capabilities: &[String],
    tasks: &BTreeMap<String, TaskNode>,
) -> Option<(usize, String)> {
    for (index, task_id) in ready_tasks.iter().enumerate() {
        let Some(task) = tasks.get(task_id) else {
            continue;
        };
        if task.required_capabilities.is_empty() {
            return Some((index, task_id.clone()));
        }
        if task
            .required_capabilities
            .iter()
            .all(|capability| worker_capabilities.binary_search(capability).is_ok())
        {
            return Some((index, task_id.clone()));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_plan() -> WorkforcePlanInput {
        WorkforcePlanInput {
            plan_id: "plan-1".to_string(),
            goal: Some("test".to_string()),
            tasks: vec![
                WorkforceTaskInput {
                    task_id: "task-1".to_string(),
                    title: "First".to_string(),
                    required_capabilities: Some(vec!["build".to_string()]),
                    depends_on: None,
                    priority: Some(0),
                    metadata: None,
                },
                WorkforceTaskInput {
                    task_id: "task-2".to_string(),
                    title: "Second".to_string(),
                    required_capabilities: Some(vec!["build".to_string()]),
                    depends_on: Some(vec!["task-1".to_string()]),
                    priority: Some(1),
                    metadata: None,
                },
            ],
        }
    }

    #[test]
    fn rejects_cycle() {
        let mut engine = WorkforceEngine::new(WorkforceRuntimeConfig {
            run_id: None,
            event_version: None,
            failure_policy: None,
        });

        let plan = WorkforcePlanInput {
            plan_id: "cycle".to_string(),
            goal: None,
            tasks: vec![
                WorkforceTaskInput {
                    task_id: "a".to_string(),
                    title: "A".to_string(),
                    required_capabilities: None,
                    depends_on: Some(vec!["b".to_string()]),
                    priority: None,
                    metadata: None,
                },
                WorkforceTaskInput {
                    task_id: "b".to_string(),
                    title: "B".to_string(),
                    required_capabilities: None,
                    depends_on: Some(vec!["a".to_string()]),
                    priority: None,
                    metadata: None,
                },
            ],
        };

        let result = engine.load_plan(plan);
        assert!(result.is_err());
    }

    #[test]
    fn schedules_deterministically() {
        let mut engine = WorkforceEngine::new(WorkforceRuntimeConfig {
            run_id: Some("run".to_string()),
            event_version: Some(1),
            failure_policy: None,
        });

        engine.load_plan(build_plan()).expect("plan loaded");
        engine
            .register_worker(WorkforceWorkerRegistration {
                worker_id: "worker-a".to_string(),
                capabilities: vec!["build".to_string()],
                capacity: 1,
                state: None,
            })
            .expect("worker registered");
        engine
            .register_worker(WorkforceWorkerRegistration {
                worker_id: "worker-b".to_string(),
                capabilities: vec!["build".to_string()],
                capacity: 1,
                state: None,
            })
            .expect("worker registered");

        let assignments = engine.schedule(Some(10)).expect("scheduled");
        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].task_id, "task-1");
        assert_eq!(assignments[0].worker_id, "worker-a");
    }

    #[test]
    fn retries_with_backoff_and_escalates() {
        let mut engine = WorkforceEngine::new(WorkforceRuntimeConfig {
            run_id: Some("run".to_string()),
            event_version: Some(1),
            failure_policy: Some(FailurePolicy {
                retry_count: 1,
                backoff_ms: 10,
                escalate_after: 2,
            }),
        });

        engine.load_plan(build_plan()).expect("plan loaded");
        engine
            .register_worker(WorkforceWorkerRegistration {
                worker_id: "worker-a".to_string(),
                capabilities: vec!["build".to_string()],
                capacity: 1,
                state: None,
            })
            .expect("worker registered");

        engine.schedule(Some(3)).expect("scheduled");
        engine
            .submit_result(
                WorkforceResultEnvelope {
                    task_id: "task-1".to_string(),
                    worker_id: "worker-a".to_string(),
                    status: WorkforceResultStatus::Failed,
                    output: None,
                    error: Some("boom".to_string()),
                    metadata: None,
                },
                Some(4),
            )
            .expect("result submitted");

        let blocked = engine
            .tasks
            .get("task-1")
            .expect("task exists")
            .blocked_until;
        assert_eq!(blocked, Some(14));

        let assignments = engine.schedule(Some(14)).expect("rescheduled");
        assert_eq!(assignments.len(), 1);

        engine
            .submit_result(
                WorkforceResultEnvelope {
                    task_id: "task-1".to_string(),
                    worker_id: "worker-a".to_string(),
                    status: WorkforceResultStatus::Failed,
                    output: None,
                    error: Some("boom".to_string()),
                    metadata: None,
                },
                Some(15),
            )
            .expect("result submitted");

        let task = engine.tasks.get("task-1").expect("task exists");
        assert_eq!(task.status, TaskStatus::Blocked);
        assert_eq!(task.blocked_reason, Some(TaskBlockReason::Escalated));
    }

    #[test]
    fn publishes_results_to_channel() {
        let mut engine = WorkforceEngine::new(WorkforceRuntimeConfig {
            run_id: Some("run".to_string()),
            event_version: Some(1),
            failure_policy: None,
        });

        engine.load_plan(build_plan()).expect("plan loaded");
        engine
            .register_worker(WorkforceWorkerRegistration {
                worker_id: "worker-a".to_string(),
                capabilities: vec!["build".to_string()],
                capacity: 1,
                state: None,
            })
            .expect("worker registered");

        engine.schedule(Some(3)).expect("scheduled");
        engine
            .submit_result(
                WorkforceResultEnvelope {
                    task_id: "task-1".to_string(),
                    worker_id: "worker-a".to_string(),
                    status: WorkforceResultStatus::Completed,
                    output: Some(json!({ "ok": true })),
                    error: None,
                    metadata: None,
                },
                Some(4),
            )
            .expect("result submitted");

        let results = engine.channel.get_results("task-1");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].worker_id, "worker-a");
    }
}
