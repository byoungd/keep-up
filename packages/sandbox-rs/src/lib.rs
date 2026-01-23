use napi::bindgen_prelude::{Buffer, Result as NapiResult};
use napi_derive::napi;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

mod path_security;
mod policy;
mod guards;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(any(
    target_os = "windows",
    not(any(target_os = "macos", target_os = "linux", target_os = "windows"))
))]
mod windows;

#[cfg(target_os = "macos")]
use macos::PlatformExecutor;
#[cfg(target_os = "linux")]
use linux::PlatformExecutor;
#[cfg(target_os = "windows")]
use windows::PlatformExecutor;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
use windows::PlatformExecutor;

use guards::{command::CommandValidator, filesystem::FileSystemGuard, network::NetworkGuard};
use guards::filesystem::ViolationResult;
use path_security::PathSecurityError;

#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error("invalid config: {0}")]
    InvalidConfig(String),
    #[error("path denied: {path} ({reason})")]
    PathDenied { path: String, reason: String },
    #[error("execution failed: {0}")]
    ExecutionFailed(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("path security error: {0}")]
    PathSecurity(#[from] PathSecurityError),
}

#[napi(object)]
pub struct SandboxConfig {
    #[napi(js_name = "networkAccess")]
    pub network_access: String,
    #[napi(js_name = "allowedHosts")]
    pub allowed_hosts: Option<Vec<String>>,
    #[napi(js_name = "allowedRoots")]
    pub allowed_roots: Option<Vec<String>>,
    #[napi(js_name = "fsIsolation")]
    pub fs_isolation: String,
    #[napi(js_name = "workingDirectory")]
    pub working_directory: Option<String>,
}

#[napi(object)]
pub struct ExecOptions {
    pub cwd: Option<String>,
    #[napi(js_name = "timeoutMs")]
    pub timeout_ms: Option<u32>,
    pub stdin: Option<String>,
    #[napi(js_name = "maxOutputBytes")]
    pub max_output_bytes: Option<u32>,
    pub env: Option<Vec<EnvVar>>,
}

impl Default for ExecOptions {
    fn default() -> Self {
        Self {
            cwd: None,
            timeout_ms: None,
            stdin: None,
            max_output_bytes: None,
            env: None,
        }
    }
}

#[napi(object)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[napi(object)]
pub struct ExecResult {
    #[napi(js_name = "exitCode")]
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    #[napi(js_name = "durationMs")]
    pub duration_ms: u32,
    #[napi(js_name = "timedOut")]
    pub timed_out: bool,
    pub truncated: bool,
}

#[napi(object)]
pub struct Decision {
    pub decision: String,
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NetworkAccess {
    None,
    Allowlist,
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FsIsolation {
    None,
    Workspace,
    Temp,
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActionIntent {
    Read,
    Write,
    Create,
    Delete,
    Rename,
    Move,
}

impl ActionIntent {
    fn from_str(value: &str) -> Result<Self, SandboxError> {
        match value {
            "read" => Ok(Self::Read),
            "write" => Ok(Self::Write),
            "create" => Ok(Self::Create),
            "delete" => Ok(Self::Delete),
            "rename" => Ok(Self::Rename),
            "move" => Ok(Self::Move),
            _ => Err(SandboxError::InvalidConfig(format!(
                "unknown action intent: {value}"
            ))),
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct SandboxPolicy {
    allowed_roots: Vec<PathBuf>,
    network_access: NetworkAccess,
}

pub(crate) struct ExecRequest {
    cwd: Option<PathBuf>,
    timeout_ms: Option<u64>,
    stdin: Option<String>,
    max_output_bytes: Option<usize>,
    env: HashMap<String, String>,
}

struct SandboxState {
    policy: SandboxPolicy,
    fs_isolation: FsIsolation,
    working_directory: Option<PathBuf>,
}

#[napi]
pub struct Sandbox {
    state: Arc<SandboxState>,
}

#[napi]
pub struct SandboxManager {
    fs_guard: FileSystemGuard,
    net_guard: NetworkGuard,
    cmd_validator: CommandValidator,
}

#[napi]
impl SandboxManager {
    #[napi(constructor)]
    pub fn new(policy: policy::SandboxPolicy, workspace_root: String) -> Self {
        let workspace = PathBuf::from(&workspace_root);
        let fs_guard = FileSystemGuard::new(policy.filesystem.clone(), workspace);
        let net_guard = NetworkGuard::new(policy.network.clone());
        let cmd_validator = CommandValidator::new(policy.commands.clone());

        Self {
            fs_guard,
            net_guard,
            cmd_validator,
        }
    }

    #[napi(js_name = "checkFileAccess")]
    pub fn check_file_access(&self, path: String, operation: String) -> ViolationResult {
        self.fs_guard.check_access(&path, &operation)
    }

    #[napi(js_name = "checkNetworkRequest")]
    pub fn check_network_request(&self, url: String, method: String) -> ViolationResult {
        self.net_guard.check_request(&url, &method)
    }

    #[napi(js_name = "checkCommand")]
    pub fn check_command(&self, command: String) -> ViolationResult {
        self.cmd_validator.validate_command(&command)
    }
}

#[napi(js_name = "createSandbox")]
pub fn create_sandbox(config: SandboxConfig) -> NapiResult<Sandbox> {
    Sandbox::new(config).map_err(to_napi_error)
}

#[napi]
impl Sandbox {
    fn new(config: SandboxConfig) -> Result<Self, SandboxError> {
        let network_access = parse_network_access(&config.network_access)?;
        let fs_isolation = parse_fs_isolation(&config.fs_isolation)?;
        let working_directory = config
            .working_directory
            .as_ref()
            .map(PathBuf::from);
        let explicit_roots = config
            .allowed_roots
            .as_ref()
            .filter(|roots| !roots.is_empty());
        let allowed_roots = if let Some(roots) = explicit_roots {
            normalize_allowed_roots(roots)?
        } else {
            compute_allowed_roots(fs_isolation, working_directory.as_ref())?
        };
        let fs_isolation = if explicit_roots.is_some() {
            FsIsolation::None
        } else {
            fs_isolation
        };

        let policy = SandboxPolicy {
            allowed_roots,
            network_access,
        };

        let state = SandboxState {
            policy,
            fs_isolation,
            working_directory,
        };

        Ok(Self {
            state: Arc::new(state),
        })
    }

    #[napi(js_name = "evaluateFileAction")]
    pub fn evaluate_file_action(&self, path: String, intent: String) -> NapiResult<Decision> {
        let action_intent = ActionIntent::from_str(intent.as_str()).map_err(to_napi_error)?;
        let path = PathBuf::from(path);
        let decision = self
            .evaluate_file_action_internal(&path, action_intent)
            .map_err(to_napi_error)?;
        Ok(decision)
    }

    #[napi]
    pub async fn execute(
        &self,
        cmd: String,
        args: Vec<String>,
        options: Option<ExecOptions>,
    ) -> NapiResult<ExecResult> {
        let options = options.unwrap_or_default();
        let request = self.build_exec_request(&options).map_err(to_napi_error)?;
        let policy = self.state.policy.clone();
        let result = napi::tokio::task::spawn_blocking(move || {
            let platform = PlatformExecutor::new();
            platform.execute(cmd.as_str(), &args, &request, &policy)
        })
        .await
        .map_err(|error| to_napi_error(SandboxError::ExecutionFailed(error.to_string())))?
        .map_err(to_napi_error)?;

        Ok(result)
    }

    #[napi]
    pub fn read(&self, path: String) -> NapiResult<Buffer> {
        let resolved = self.resolve_allowed_path(Path::new(&path)).map_err(to_napi_error)?;
        let bytes = std::fs::read(&resolved)
            .map_err(|error| to_napi_error(SandboxError::from(error)))?;
        Ok(Buffer::from(bytes))
    }

    #[napi]
    pub fn write(&self, path: String, data: Buffer) -> NapiResult<()> {
        let resolved = self.resolve_allowed_path(Path::new(&path)).map_err(to_napi_error)?;
        std::fs::write(&resolved, data.as_ref())
            .map_err(|error| to_napi_error(SandboxError::from(error)))?;
        Ok(())
    }

    #[napi]
    pub fn list(&self, path: String) -> NapiResult<Vec<String>> {
        let resolved = self.resolve_allowed_path(Path::new(&path)).map_err(to_napi_error)?;
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(&resolved)
            .map_err(|error| to_napi_error(SandboxError::from(error)))?
        {
            let entry =
                entry.map_err(|error| to_napi_error(SandboxError::from(error)))?;
            entries.push(entry.path().to_string_lossy().to_string());
        }
        entries.sort();
        Ok(entries)
    }

    fn build_exec_request(&self, options: &ExecOptions) -> Result<ExecRequest, SandboxError> {
        let cwd = if let Some(cwd) = &options.cwd {
            Some(self.resolve_allowed_path(Path::new(cwd))?)
        } else {
            self.resolve_default_cwd()?
        };

        let mut env = HashMap::new();
        if let Some(pairs) = &options.env {
            for pair in pairs {
                env.insert(pair.key.clone(), pair.value.clone());
            }
        }

        Ok(ExecRequest {
            cwd,
            timeout_ms: options.timeout_ms.map(u64::from),
            stdin: options.stdin.clone(),
            max_output_bytes: options.max_output_bytes.map(|value| value as usize),
            env,
        })
    }

    fn resolve_default_cwd(&self) -> Result<Option<PathBuf>, SandboxError> {
        match self.state.fs_isolation {
            FsIsolation::Workspace | FsIsolation::Temp => {
                let cwd = self
                    .state
                    .working_directory
                    .clone()
                    .ok_or_else(|| {
                        SandboxError::InvalidConfig(
                            "workingDirectory is required for sandboxed execution".to_string(),
                        )
                    })?;
                Ok(Some(self.resolve_allowed_path(&cwd)?))
            }
            FsIsolation::None | FsIsolation::Full => Ok(self.state.working_directory.clone()),
        }
    }

    fn resolve_allowed_path(&self, path: &Path) -> Result<PathBuf, SandboxError> {
        let normalized = path_security::normalize_path(path)?;
        if self.state.policy.allowed_roots.is_empty() {
            return Ok(normalized);
        }

        for root in &self.state.policy.allowed_roots {
            if normalized.starts_with(root) {
                return Ok(normalized);
            }
        }

        Err(SandboxError::PathDenied {
            path: normalized.to_string_lossy().to_string(),
            reason: "path outside allowed roots".to_string(),
        })
    }

    fn evaluate_file_action_internal(
        &self,
        path: &Path,
        _intent: ActionIntent,
    ) -> Result<Decision, SandboxError> {
        match self.resolve_allowed_path(path) {
            Ok(_) => Ok(Decision {
                decision: "allow".to_string(),
                reason: None,
            }),
            Err(error) => Ok(Decision {
                decision: "deny".to_string(),
                reason: Some(error.to_string()),
            }),
        }
    }
}

fn compute_allowed_roots(
    isolation: FsIsolation,
    working_directory: Option<&PathBuf>,
) -> Result<Vec<PathBuf>, SandboxError> {
    match isolation {
        FsIsolation::None | FsIsolation::Full => Ok(Vec::new()),
        FsIsolation::Workspace => {
            let root = working_directory.ok_or_else(|| {
                SandboxError::InvalidConfig("workingDirectory is required".to_string())
            })?;
            Ok(vec![path_security::normalize_path(root)?])
        }
        FsIsolation::Temp => {
            let mut roots = vec![path_security::normalize_path(&std::env::temp_dir())?];
            if let Some(root) = working_directory {
                roots.push(path_security::normalize_path(root)?);
            }
            Ok(roots)
        }
    }
}

fn normalize_allowed_roots(roots: &[String]) -> Result<Vec<PathBuf>, SandboxError> {
    let mut normalized = Vec::new();
    for root in roots {
        if root.trim().is_empty() {
            continue;
        }
        let path = PathBuf::from(root);
        let resolved = path_security::normalize_path(&path)?;
        normalized.push(resolved);
    }

    normalized.sort();
    normalized.dedup();
    Ok(normalized)
}

fn parse_network_access(value: &str) -> Result<NetworkAccess, SandboxError> {
    match value {
        "none" => Ok(NetworkAccess::None),
        "allowlist" => Ok(NetworkAccess::Allowlist),
        "full" => Ok(NetworkAccess::Full),
        _ => Err(SandboxError::InvalidConfig(format!(
            "unknown network access: {value}"
        ))),
    }
}

fn parse_fs_isolation(value: &str) -> Result<FsIsolation, SandboxError> {
    match value {
        "none" => Ok(FsIsolation::None),
        "workspace" => Ok(FsIsolation::Workspace),
        "temp" => Ok(FsIsolation::Temp),
        "full" => Ok(FsIsolation::Full),
        _ => Err(SandboxError::InvalidConfig(format!(
            "unknown fs isolation: {value}"
        ))),
    }
}

fn to_napi_error(error: SandboxError) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

pub(crate) fn run_command(
    command: &str,
    args: &[String],
    options: &ExecRequest,
) -> Result<ExecResult, SandboxError> {
    let mut cmd = std::process::Command::new(command);
    cmd.args(args);
    if let Some(cwd) = &options.cwd {
        cmd.current_dir(cwd);
    }
    for (key, value) in &options.env {
        cmd.env(key, value);
    }
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn()?;
    if let Some(stdin) = &options.stdin {
        if let Some(mut handle) = child.stdin.take() {
            use std::io::Write;
            handle.write_all(stdin.as_bytes())?;
        }
    }

    let start = Instant::now();
    let timeout = options.timeout_ms.map(Duration::from_millis);
    let (output, timed_out) = wait_with_timeout(child, timeout)?;
    let duration_ms = start.elapsed().as_millis() as u32;

    let max_bytes = options.max_output_bytes.unwrap_or(1024 * 1024);
    let (stdout, stdout_truncated) = truncate_output(&output.stdout, max_bytes);
    let (stderr, stderr_truncated) = truncate_output(&output.stderr, max_bytes);

    Ok(ExecResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout,
        stderr,
        duration_ms,
        timed_out,
        truncated: stdout_truncated || stderr_truncated,
    })
}

fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Option<Duration>,
) -> Result<(std::process::Output, bool), SandboxError> {
    if timeout.is_none() {
        let output = child.wait_with_output()?;
        return Ok((output, false));
    }

    let timeout = timeout.expect("timeout is checked above");
    let start = Instant::now();
    loop {
        if let Some(_) = child.try_wait()? {
            let output = child.wait_with_output()?;
            return Ok((output, false));
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let output = child.wait_with_output()?;
            return Ok((output, true));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn truncate_output(bytes: &[u8], max_bytes: usize) -> (String, bool) {
    if bytes.len() <= max_bytes {
        return (String::from_utf8_lossy(bytes).to_string(), false);
    }

    let truncated = &bytes[..max_bytes];
    (String::from_utf8_lossy(truncated).to_string(), true)
}
