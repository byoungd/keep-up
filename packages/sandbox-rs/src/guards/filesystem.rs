use std::path::{Path, PathBuf};

use napi_derive::napi;

use crate::path_security;
use crate::policy::FilesystemPolicy;

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ViolationResult {
    pub allowed: bool,
    pub reason: Option<String>,
}

pub struct FileSystemGuard {
    policy: FilesystemPolicy,
    workspace_root: PathBuf,
}

impl FileSystemGuard {
    pub fn new(policy: FilesystemPolicy, workspace_root: PathBuf) -> Self {
        let normalized_root =
            path_security::normalize_path(&workspace_root).unwrap_or(workspace_root);
        Self {
            policy,
            workspace_root: normalized_root,
        }
    }

    pub fn check_access(&self, path: &str, _operation: &str) -> ViolationResult {
        let expanded = self.expand_home(path);

        if !self.policy.allow_symlinks && self.contains_symlink(Path::new(&expanded)) {
            return ViolationResult {
                allowed: false,
                reason: Some("Symlinks not allowed".to_string()),
            };
        }

        let normalized = match self.normalize_path(&expanded) {
            Ok(value) => value,
            Err(reason) => {
                return ViolationResult {
                    allowed: false,
                    reason: Some(reason),
                };
            }
        };

        if self.is_blocked(&normalized) {
            return ViolationResult {
                allowed: false,
                reason: Some(format!("Path {path} is in blocked list")),
            };
        }

        if !self.is_allowed(&normalized) {
            return ViolationResult {
                allowed: false,
                reason: Some(format!("Path {path} is outside allowed paths")),
            };
        }

        if (self.policy.mode == "workspace" || self.policy.mode == "strict")
            && !self.is_within_workspace(&normalized)
        {
            return ViolationResult {
                allowed: false,
                reason: Some(format!("Path {path} is outside workspace")),
            };
        }

        if !self.policy.allow_hidden_files && self.is_hidden(path) {
            return ViolationResult {
                allowed: false,
                reason: Some("Hidden files not allowed".to_string()),
            };
        }

        ViolationResult {
            allowed: true,
            reason: None,
        }
    }

    fn normalize_path(&self, path: &str) -> Result<PathBuf, String> {
        path_security::normalize_path(Path::new(path))
            .map_err(|error| format!("Failed to normalize path: {error}"))
    }

    fn normalize_candidate(&self, path: &str) -> Option<PathBuf> {
        let expanded = self.expand_home(path);
        if expanded.is_empty() {
            return None;
        }

        match path_security::normalize_path(Path::new(&expanded)) {
            Ok(value) => Some(value),
            Err(_) => Some(PathBuf::from(expanded)),
        }
    }

    fn is_blocked(&self, path: &Path) -> bool {
        self.policy.blocked_paths.iter().any(|blocked| {
            self.normalize_candidate(blocked)
                .map(|blocked_path| path.starts_with(blocked_path))
                .unwrap_or(false)
        })
    }

    fn is_allowed(&self, path: &Path) -> bool {
        if self.policy.allowed_paths.is_empty() {
            return true;
        }

        self.policy.allowed_paths.iter().any(|allowed| {
            self.normalize_candidate(allowed)
                .map(|allowed_path| path.starts_with(allowed_path))
                .unwrap_or(false)
        })
    }

    fn is_within_workspace(&self, path: &Path) -> bool {
        path.starts_with(&self.workspace_root)
    }

    fn is_hidden(&self, path: &str) -> bool {
        Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with('.') && name != "." && name != "..")
            .unwrap_or(false)
    }

    fn expand_home(&self, path: &str) -> String {
        if path.starts_with("~/") {
            if let Ok(home) = std::env::var("HOME") {
                return path.replacen('~', &home, 1);
            }
        }
        path.to_string()
    }

    fn contains_symlink(&self, path: &Path) -> bool {
        for ancestor in path.ancestors() {
            if let Ok(metadata) = std::fs::symlink_metadata(ancestor) {
                if metadata.file_type().is_symlink() {
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::FilesystemPolicy;
    use tempfile::TempDir;

    #[test]
    fn filesystem_guard_blocks_blocked_path() {
        let temp = TempDir::new().expect("tempdir");
        let root = temp.path().to_path_buf();
        let blocked = root.join("blocked");
        let policy = FilesystemPolicy {
            mode: "strict".to_string(),
            allowed_paths: vec![root.to_string_lossy().to_string()],
            blocked_paths: vec![blocked.to_string_lossy().to_string()],
            allow_symlinks: true,
            allow_hidden_files: true,
        };

        let guard = FileSystemGuard::new(policy, root);
        let target = blocked.join("secret.txt");
        let result = guard.check_access(&target.to_string_lossy(), "read");

        assert!(!result.allowed);
        assert!(result.reason.is_some());
    }

    #[test]
    fn filesystem_guard_allows_workspace_path() {
        let temp = TempDir::new().expect("tempdir");
        let root = temp.path().to_path_buf();
        let policy = FilesystemPolicy {
            mode: "workspace".to_string(),
            allowed_paths: vec![root.to_string_lossy().to_string()],
            blocked_paths: Vec::new(),
            allow_symlinks: true,
            allow_hidden_files: true,
        };

        let guard = FileSystemGuard::new(policy, root.clone());
        let target = root.join("allowed.txt");
        let result = guard.check_access(&target.to_string_lossy(), "read");

        assert!(result.allowed);
    }
}
