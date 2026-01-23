use crate::types::WorkforcePlanInput;

pub trait Planner {
    fn build_plan(&self, goal: &str) -> WorkforcePlanInput;
}

#[derive(Debug, Clone)]
pub struct StaticPlanner {
    plan: WorkforcePlanInput,
}

impl StaticPlanner {
    pub fn new(plan: WorkforcePlanInput) -> Self {
        Self { plan }
    }
}

impl Planner for StaticPlanner {
    fn build_plan(&self, _goal: &str) -> WorkforcePlanInput {
        self.plan.clone()
    }
}
