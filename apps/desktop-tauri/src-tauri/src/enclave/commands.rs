use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

use sandbox_rs::guards::command::CommandValidator;
use sandbox_rs::guards::filesystem::FileSystemGuard;
use sandbox_rs::policy::{CommandPolicy, FilesystemPolicy};
use sandbox_rs::{create_sandbox, EnvVar, ExecOptions, SandboxConfig};

use crate::enclave::{AuditEntry, Decision, EnclavePolicy, EnclaveState};

const ACTION_FS_READ: &str = "fs_read";
const ACTION_FS_WRITE: &str = "fs_write";
const ACTION_FS_LIST: &str = "fs_list";
const ACTION_SHELL_EXEC: &str = "shell_exec";
const ACTION_AUDIT_EXPORT: &str = "audit_export";

#[tauri::command]
pub fn get_policy(state: State<'_, EnclaveState>) -> Result<EnclavePolicy, String> {
    let policy = state.policy()?;
    Ok(policy.clone())
}

#[tauri::command]
pub fn set_policy(policy: EnclavePolicy, state: State<'_, EnclaveState>) -> Result<(), String> {
    {
        let mut current = state.policy()?;
        *current = policy.clone();
    }

    let mut audit = state.audit()?;
    audit.log("set_policy", "policy", Decision::Allowed, policy.session_id.clone());
    Ok(())
}

#[tauri::command]
pub fn get_audit_log(
    limit: Option<usize>,
    state: State<'_, EnclaveState>,
) -> Result<Vec<AuditEntry>, String> {
    let audit = state.audit()?;
    Ok(audit.list(limit))
}

#[tauri::command]
pub fn export_audit_log(state: State<'_, EnclaveState>, app: AppHandle) -> Result<String, String> {
    let policy = state.policy()?.clone();
    let entries = state.audit()?.list(None);

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let timestamp = current_timestamp();
    let path = dir.join(format!("enclave_audit_{timestamp}.json"));
    let payload = serde_json::to_string_pretty(&entries).map_err(|error| error.to_string())?;
    std::fs::write(&path, payload).map_err(|error| error.to_string())?;

    record_audit(&state, ACTION_AUDIT_EXPORT, path.to_string_lossy(), Decision::Allowed, &policy);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn fs_read(path: String, state: State<'_, EnclaveState>) -> Result<Vec<u8>, String> {
    let policy = state.policy()?.clone();
    ensure_allowed_roots(&policy, ACTION_FS_READ, &state)?;

    let guard = build_fs_guard(&policy);
    let decision = guard.check_access(&path, "read");
    if !decision.allowed {
        let reason = decision.reason.unwrap_or_else(|| "Access denied".to_string());
        record_audit(&state, ACTION_FS_READ, &path, Decision::Denied { reason: reason.clone() }, &policy);
        return Err(reason);
    }

    match std::fs::read(&path) {
        Ok(contents) => {
            record_audit(&state, ACTION_FS_READ, &path, Decision::Allowed, &policy);
            Ok(contents)
        }
        Err(error) => {
            let reason = error.to_string();
            record_audit(
                &state,
                ACTION_FS_READ,
                &path,
                Decision::Denied { reason: reason.clone() },
                &policy,
            );
            Err(reason)
        }
    }
}

#[tauri::command]
pub fn fs_write(path: String, contents: Vec<u8>, state: State<'_, EnclaveState>) -> Result<(), String> {
    let policy = state.policy()?.clone();
    ensure_allowed_roots(&policy, ACTION_FS_WRITE, &state)?;

    let guard = build_fs_guard(&policy);
    let decision = guard.check_access(&path, "write");
    if !decision.allowed {
        let reason = decision.reason.unwrap_or_else(|| "Access denied".to_string());
        record_audit(&state, ACTION_FS_WRITE, &path, Decision::Denied { reason: reason.clone() }, &policy);
        return Err(reason);
    }

    match std::fs::write(&path, contents) {
        Ok(()) => {
            record_audit(&state, ACTION_FS_WRITE, &path, Decision::Allowed, &policy);
            Ok(())
        }
        Err(error) => {
            let reason = error.to_string();
            record_audit(
                &state,
                ACTION_FS_WRITE,
                &path,
                Decision::Denied { reason: reason.clone() },
                &policy,
            );
            Err(reason)
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_ms: Option<i64>,
}

#[tauri::command]
pub fn fs_list(path: String, state: State<'_, EnclaveState>) -> Result<Vec<FileEntry>, String> {
    let policy = state.policy()?.clone();
    ensure_allowed_roots(&policy, ACTION_FS_LIST, &state)?;

    let guard = build_fs_guard(&policy);
    let decision = guard.check_access(&path, "read");
    if !decision.allowed {
        let reason = decision.reason.unwrap_or_else(|| "Access denied".to_string());
        record_audit(&state, ACTION_FS_LIST, &path, Decision::Denied { reason: reason.clone() }, &policy);
        return Err(reason);
    }

    let mut entries = Vec::new();
    let dir_entries = std::fs::read_dir(&path).map_err(|error| error.to_string())?;

    for entry in dir_entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().ok();
        let file_type = metadata.as_ref().map(|meta| meta.is_dir()).unwrap_or(false);
        let modified_ms = metadata
            .as_ref()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64);

        entries.push(FileEntry {
            path: entry.path().to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: file_type,
            size: metadata.as_ref().map(|meta| meta.len()),
            modified_ms,
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    record_audit(&state, ACTION_FS_LIST, &path, Decision::Allowed, &policy);
    Ok(entries)
}

#[derive(Debug, Deserialize)]
pub struct ShellExecArgs {
    pub cmd: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u32>,
    pub stdin: Option<String>,
    pub max_output_bytes: Option<u32>,
    pub env: Option<Vec<ShellEnvVar>>,
}

#[derive(Debug, Deserialize)]
pub struct ShellEnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u32,
    pub timed_out: bool,
    pub truncated: bool,
}

#[tauri::command]
pub async fn shell_exec(
    args: ShellExecArgs,
    state: State<'_, EnclaveState>,
) -> Result<ShellExecResult, String> {
    let policy = state.policy()?.clone();
    ensure_allowed_roots(&policy, ACTION_SHELL_EXEC, &state)?;

    let validator = build_command_validator(&policy);
    let validation = validator.validate_command(&args.cmd);
    if !validation.allowed {
        let reason = validation
            .reason
            .unwrap_or_else(|| "Command not allowed".to_string());
        record_audit(
            &state,
            ACTION_SHELL_EXEC,
            &args.cmd,
            Decision::Denied { reason: reason.clone() },
            &policy,
        );
        return Err(reason);
    }

    let sandbox = build_sandbox(&policy)?;
    let exec_env = args.env.map(|pairs| {
        pairs
            .into_iter()
            .map(|pair| EnvVar {
                key: pair.key,
                value: pair.value,
            })
            .collect()
    });
    let options = ExecOptions {
        cwd: args.cwd.clone(),
        timeout_ms: args.timeout_ms,
        stdin: args.stdin.clone(),
        max_output_bytes: args.max_output_bytes,
        env: exec_env,
    };

    match sandbox.execute(args.cmd.clone(), args.args.clone(), Some(options)).await {
        Ok(result) => {
            record_audit(&state, ACTION_SHELL_EXEC, &args.cmd, Decision::Allowed, &policy);
            Ok(ShellExecResult {
                exit_code: result.exit_code,
                stdout: result.stdout,
                stderr: result.stderr,
                duration_ms: result.duration_ms,
                timed_out: result.timed_out,
                truncated: result.truncated,
            })
        }
        Err(error) => {
            let reason = error.to_string();
            record_audit(
                &state,
                ACTION_SHELL_EXEC,
                &args.cmd,
                Decision::Denied { reason: reason.clone() },
                &policy,
            );
            Err(reason)
        }
    }
}

fn build_fs_guard(policy: &EnclavePolicy) -> FileSystemGuard {
    let allowed_paths = policy
        .allowed_roots
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();

    let fs_policy = FilesystemPolicy {
        mode: "allowlist".to_string(),
        allowed_paths,
        blocked_paths: Vec::new(),
        allow_symlinks: false,
        allow_hidden_files: true,
    };

    let workspace_root = policy
        .allowed_roots
        .iter()
        .next()
        .cloned()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| Path::new("/").to_path_buf()));

    FileSystemGuard::new(fs_policy, workspace_root)
}

fn build_command_validator(policy: &EnclavePolicy) -> CommandValidator {
    let allowed_commands = if policy.allowed_commands.is_empty() {
        Some(Vec::new())
    } else {
        Some(policy.allowed_commands.iter().cloned().collect())
    };

    let command_policy = CommandPolicy {
        mode: "whitelist".to_string(),
        allowed_commands,
        blocked_commands: None,
        allow_sudo: false,
    };

    CommandValidator::new(command_policy)
}

fn build_sandbox(policy: &EnclavePolicy) -> Result<sandbox_rs::Sandbox, String> {
    let allowed_roots: Vec<String> = policy
        .allowed_roots
        .iter()
        .map(|root| root.to_string_lossy().to_string())
        .collect();
    let allowed_hosts: Vec<String> = policy.allowed_hosts.iter().cloned().collect();

    let config = SandboxConfig {
        network_access: if allowed_hosts.is_empty() {
            "none".to_string()
        } else {
            "allowlist".to_string()
        },
        allowed_hosts: if allowed_hosts.is_empty() {
            None
        } else {
            Some(allowed_hosts)
        },
        allowed_roots: if allowed_roots.is_empty() {
            None
        } else {
            Some(allowed_roots)
        },
        fs_isolation: "none".to_string(),
        working_directory: policy
            .allowed_roots
            .iter()
            .next()
            .map(|root| root.to_string_lossy().to_string()),
    };

    create_sandbox(config).map_err(|error| error.to_string())
}

fn ensure_allowed_roots(
    policy: &EnclavePolicy,
    action: &str,
    state: &State<'_, EnclaveState>,
) -> Result<(), String> {
    if policy.allowed_roots.is_empty() {
        let reason = "No allowed roots configured".to_string();
        record_audit(
            state,
            action,
            "(no roots)",
            Decision::Denied {
                reason: reason.clone(),
            },
            policy,
        );
        return Err(reason);
    }
    Ok(())
}

fn record_audit(
    state: &State<'_, EnclaveState>,
    action: &str,
    target: impl AsRef<str>,
    decision: Decision,
    policy: &EnclavePolicy,
) {
    if let Ok(mut audit) = state.audit() {
        audit.log(action, target.as_ref(), decision, policy.session_id.clone());
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
