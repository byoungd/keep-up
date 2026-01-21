use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum PathSecurityError {
    #[error("failed to resolve current directory: {0}")]
    CurrentDir(#[source] std::io::Error),
    #[error("path has no parent: {path}")]
    NoParent { path: PathBuf },
    #[error("invalid relative path component: {component}")]
    InvalidComponent { component: String },
    #[error("path escapes root: {path} (root: {root})")]
    PathEscape { path: PathBuf, root: PathBuf },
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn normalize_path(path: &Path) -> Result<PathBuf, PathSecurityError> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(PathSecurityError::CurrentDir)?
            .join(path)
    };

    let normalized = normalize_components(&absolute)?;
    let (existing_prefix, suffix) = split_existing_prefix(&normalized)?;
    let canonical_prefix = std::fs::canonicalize(existing_prefix)?;

    let mut resolved = canonical_prefix;
    for component in suffix {
        resolved.push(component);
    }

    Ok(resolved)
}

pub fn enforce_within_root(path: &Path, root: &Path) -> Result<PathBuf, PathSecurityError> {
    let normalized_path = normalize_path(path)?;
    let normalized_root = normalize_path(root)?;

    if normalized_path.starts_with(&normalized_root) {
        return Ok(normalized_path);
    }

    Err(PathSecurityError::PathEscape {
        path: normalized_path,
        root: normalized_root,
    })
}

pub fn is_within_root(path: &Path, root: &Path) -> Result<bool, PathSecurityError> {
    let normalized_path = normalize_path(path)?;
    let normalized_root = normalize_path(root)?;
    Ok(normalized_path.starts_with(&normalized_root))
}

fn normalize_components(path: &Path) -> Result<PathBuf, PathSecurityError> {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(PathSecurityError::InvalidComponent {
                        component: "..".to_string(),
                    });
                }
            }
            Component::Normal(part) => normalized.push(part),
        }
    }

    Ok(normalized)
}

fn split_existing_prefix(path: &Path) -> Result<(PathBuf, Vec<OsString>), PathSecurityError> {
    let mut current = path;
    let mut suffix: Vec<OsString> = Vec::new();

    loop {
        if current.exists() {
            suffix.reverse();
            return Ok((current.to_path_buf(), suffix));
        }
        let name = current
            .file_name()
            .ok_or_else(|| PathSecurityError::NoParent {
                path: current.to_path_buf(),
            })?;
        suffix.push(name.to_os_string());
        current = current.parent().ok_or_else(|| PathSecurityError::NoParent {
            path: current.to_path_buf(),
        })?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn normalize_path_handles_missing_leaf() {
        let temp = TempDir::new().expect("tempdir");
        let root = temp.path();
        let target = root.join("alpha").join("beta").join("..").join("gamma");
        let normalized = normalize_path(&target).expect("normalize path");
        assert!(normalized.ends_with(Path::new("alpha/gamma")));
    }

    #[test]
    fn enforce_within_root_rejects_symlink_escape() {
        let temp = TempDir::new().expect("tempdir");
        let root = temp.path();
        let outside = TempDir::new().expect("outside");
        let link_path = root.join("escape");
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), &link_path).expect("symlink");

        #[cfg(windows)]
        if std::os::windows::fs::symlink_dir(outside.path(), &link_path).is_err() {
            return;
        }

        let escaped = link_path.join("file.txt");
        let result = enforce_within_root(&escaped, root);
        assert!(result.is_err(), "expected escape to be rejected");
    }

    #[test]
    fn enforce_within_root_allows_child_path() {
        let temp = TempDir::new().expect("tempdir");
        let root = temp.path();
        let child = root.join("child").join("file.txt");
        let normalized = enforce_within_root(&child, root).expect("within root");
        let normalized_root = normalize_path(root).expect("normalize root");
        assert!(normalized.starts_with(&normalized_root));
        assert!(is_within_root(&child, root).expect("check within root"));
    }
}
