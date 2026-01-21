use crate::{run_command, ExecRequest, ExecResult, SandboxError, SandboxPolicy};

pub struct PlatformExecutor;

impl PlatformExecutor {
    pub fn new() -> Self {
        Self
    }

    pub fn execute(
        &self,
        command: &str,
        args: &[String],
        options: &ExecRequest,
        _policy: &SandboxPolicy,
    ) -> Result<ExecResult, SandboxError> {
        run_command(command, args, options)
    }
}
