use std::path::Path;

use crate::{
    run_command, ExecRequest, ExecResult, NetworkAccess, SandboxError, SandboxPolicy,
};

const SANDBOX_EXECUTABLE: &str = "/usr/bin/sandbox-exec";
const SEATBELT_BASE_POLICY: &str = include_str!("seatbelt_base_policy.sbpl");
const SEATBELT_NETWORK_POLICY: &str = include_str!("seatbelt_network_policy.sbpl");

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
        policy: &SandboxPolicy,
    ) -> Result<ExecResult, SandboxError> {
        if !Path::new(SANDBOX_EXECUTABLE).exists() {
            return Err(SandboxError::ExecutionFailed(
                "sandbox-exec not found at /usr/bin/sandbox-exec".to_string(),
            ));
        }

        let (profile, params) = build_profile(policy);
        let mut seatbelt_args = vec!["-p".to_string(), profile];
        for (key, value) in params {
            seatbelt_args.push(format!("-D{key}={}", value.to_string_lossy()));
        }
        seatbelt_args.push("--".to_string());
        seatbelt_args.push(command.to_string());
        seatbelt_args.extend(args.iter().cloned());

        run_command(SANDBOX_EXECUTABLE, &seatbelt_args, options)
    }
}

fn build_profile(policy: &SandboxPolicy) -> (String, Vec<(String, std::path::PathBuf)>) {
    let mut params = Vec::new();
    let mut read_filters = Vec::new();
    let mut write_filters = Vec::new();

    for (index, root) in policy.allowed_roots.iter().enumerate() {
        let key = format!("ROOT_{index}");
        params.push((key.clone(), root.clone()));
        read_filters.push(format!("(subpath (param \"{key}\"))"));
        write_filters.push(format!("(subpath (param \"{key}\"))"));
    }

    let read_policy = if read_filters.is_empty() {
        "(allow file-read*)".to_string()
    } else {
        format!("(allow file-read* {})", read_filters.join(" "))
    };

    let write_policy = if write_filters.is_empty() {
        "(allow file-write*)".to_string()
    } else {
        format!("(allow file-write* {})", write_filters.join(" "))
    };

    let network_policy = match policy.network_access {
        NetworkAccess::Full => SEATBELT_NETWORK_POLICY,
        NetworkAccess::Allowlist | NetworkAccess::None => "",
    };

    let full_policy = format!(
        "{SEATBELT_BASE_POLICY}\n{read_policy}\n{write_policy}\n{network_policy}"
    );

    (full_policy, params)
}
