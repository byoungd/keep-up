use crate::{run_command_with, ExecRequest, ExecResult, NetworkAccess, SandboxError, SandboxPolicy};
use std::collections::BTreeMap;
use std::io;
use std::os::unix::process::CommandExt;

use landlock::{AccessFs, CompatLevel, Ruleset, RulesetStatus, ABI};
use seccompiler::{
    apply_filter, BpfProgram, SeccompAction, SeccompCmpArgLen, SeccompCmpOp, SeccompCondition,
    SeccompFilter, SeccompRule, TargetArch,
};

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
        let policy = policy.clone();
        run_command_with(command, args, options, move |cmd| {
            let policy = policy.clone();
            unsafe {
                cmd.pre_exec(move || {
                    apply_sandbox_policy(&policy).map_err(|error| {
                        io::Error::new(io::ErrorKind::Other, error.to_string())
                    })
                });
            }
            Ok(())
        })
    }
}

fn apply_sandbox_policy(policy: &SandboxPolicy) -> Result<(), SandboxError> {
    if policy.network_access != NetworkAccess::Full || !policy.allowed_roots.is_empty() {
        set_no_new_privs()?;
    }

    if policy.network_access != NetworkAccess::Full {
        install_network_seccomp_filter_on_current_thread()?;
    }

    if !policy.allowed_roots.is_empty() {
        install_filesystem_landlock_rules_on_current_thread(&policy.allowed_roots)?;
    }

    Ok(())
}

fn set_no_new_privs() -> Result<(), SandboxError> {
    let result = unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
    if result != 0 {
        return Err(SandboxError::Io(std::io::Error::last_os_error()));
    }
    Ok(())
}

fn install_filesystem_landlock_rules_on_current_thread(
    writable_roots: &[std::path::PathBuf],
) -> Result<(), SandboxError> {
    let abi = ABI::V5;
    let access_rw = AccessFs::from_all(abi);
    let access_ro = AccessFs::from_read(abi);

    let mut ruleset = Ruleset::default()
        .set_compatibility(CompatLevel::BestEffort)
        .handle_access(access_rw)
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?
        .create()
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?
        .add_rules(landlock::path_beneath_rules(&["/"], access_ro))
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?
        .add_rules(landlock::path_beneath_rules(&["/dev/null"], access_rw))
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?
        .set_no_new_privs(true);

    if !writable_roots.is_empty() {
        ruleset = ruleset
            .add_rules(landlock::path_beneath_rules(writable_roots, access_rw))
            .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;
    }

    let status = ruleset
        .restrict_self()
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;

    if status.ruleset == RulesetStatus::NotEnforced {
        return Err(SandboxError::ExecutionFailed(
            "Landlock ruleset not enforced on this kernel".to_string(),
        ));
    }

    Ok(())
}

fn install_network_seccomp_filter_on_current_thread() -> Result<(), SandboxError> {
    let mut rules: BTreeMap<i64, Vec<SeccompRule>> = BTreeMap::new();
    let mut deny_syscall = |nr: i64| {
        rules.insert(nr, vec![]);
    };

    deny_syscall(libc::SYS_connect);
    deny_syscall(libc::SYS_accept);
    deny_syscall(libc::SYS_accept4);
    deny_syscall(libc::SYS_bind);
    deny_syscall(libc::SYS_listen);
    deny_syscall(libc::SYS_getpeername);
    deny_syscall(libc::SYS_getsockname);
    deny_syscall(libc::SYS_shutdown);
    deny_syscall(libc::SYS_sendto);
    deny_syscall(libc::SYS_sendmmsg);
    deny_syscall(libc::SYS_recvmmsg);
    deny_syscall(libc::SYS_getsockopt);
    deny_syscall(libc::SYS_setsockopt);
    deny_syscall(libc::SYS_ptrace);

    let unix_only_rule = SeccompRule::new(vec![SeccompCondition::new(
        0,
        SeccompCmpArgLen::Dword,
        SeccompCmpOp::Ne,
        libc::AF_UNIX as u64,
    )
    .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?])
    .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;

    rules.insert(libc::SYS_socket, vec![unix_only_rule.clone()]);
    rules.insert(libc::SYS_socketpair, vec![unix_only_rule]);

    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Allow,
        SeccompAction::Errno(libc::EPERM as u32),
        if cfg!(target_arch = "x86_64") {
            TargetArch::x86_64
        } else if cfg!(target_arch = "aarch64") {
            TargetArch::aarch64
        } else {
            return Err(SandboxError::ExecutionFailed(
                "unsupported architecture for seccomp filter".to_string(),
            ));
        },
    )
    .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;

    let prog: BpfProgram = filter
        .try_into()
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;
    apply_filter(&prog)
        .map_err(|err| SandboxError::ExecutionFailed(err.to_string()))?;

    Ok(())
}
