//! Rust Gitignore Matcher
//!
//! Fast file walking with gitignore support using the `ignore` crate (ripgrep's engine).

use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;

/// Options for listing files.
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ListFilesOptions {
    /// Maximum depth for recursive listing. None = unlimited.
    pub max_depth: Option<u32>,
    /// Include hidden files/directories.
    pub include_hidden: Option<bool>,
    /// Respect .gitignore files.
    pub respect_gitignore: Option<bool>,
}

/// A file entry returned by list_files.
#[napi(object)]
#[derive(Debug, Clone)]
pub struct FileEntry {
    /// Relative path from root.
    pub path: String,
    /// "file" or "directory".
    pub entry_type: String,
    /// File size in bytes (only for files).
    pub size: Option<i64>,
}

/// List files in a directory, respecting .gitignore by default.
///
/// Uses the `ignore` crate which is the same engine powering ripgrep.
/// This is significantly faster than shelling out to `git ls-files`.
#[napi]
pub fn list_files(root: String, options: Option<ListFilesOptions>) -> Result<Vec<FileEntry>> {
    let opts = options.unwrap_or_default();
    let max_depth = opts.max_depth.map(|d| d as usize);
    let include_hidden = opts.include_hidden.unwrap_or(false);
    let respect_gitignore = opts.respect_gitignore.unwrap_or(true);

    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(Error::new(
            Status::GenericFailure,
            format!("Path does not exist: {}", root),
        ));
    }

    let mut builder = WalkBuilder::new(&root);
    builder
        .hidden(!include_hidden)
        .git_ignore(respect_gitignore)
        .git_global(respect_gitignore)
        .git_exclude(respect_gitignore)
        .parents(respect_gitignore)
        .follow_links(false);

    if let Some(depth) = max_depth {
        builder.max_depth(Some(depth));
    }

    let mut entries = Vec::new();

    for result in builder.build() {
        match result {
            Ok(entry) => {
                // Skip the root directory itself
                if entry.path() == root_path {
                    continue;
                }

                let relative_path = entry
                    .path()
                    .strip_prefix(root_path)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .to_string();

                // Normalize path separators for cross-platform consistency
                let normalized_path = relative_path.replace('\\', "/");

                let file_type = entry.file_type();
                let (entry_type, size) = if file_type.map_or(false, |ft| ft.is_dir()) {
                    ("directory".to_string(), None)
                } else if file_type.map_or(false, |ft| ft.is_file()) {
                    let size = entry.metadata().ok().map(|m| m.len() as i64);
                    ("file".to_string(), size)
                } else {
                    // Skip symlinks and other special files
                    continue;
                };

                entries.push(FileEntry {
                    path: normalized_path,
                    entry_type,
                    size,
                });
            }
            Err(err) => {
                // Log but don't fail on individual entry errors
                eprintln!("Warning: {}", err);
            }
        }
    }

    Ok(entries)
}

/// Check if a path is ignored by .gitignore rules.
#[napi]
pub fn is_ignored(root: String, path: String) -> Result<bool> {
    let root_path = Path::new(&root);
    let check_path = Path::new(&path);

    // Build a walker just to get the gitignore matching
    let walker = WalkBuilder::new(root_path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .max_depth(Some(0))
        .build();

    // Get the gitignore from the walker
    for result in walker {
        if let Ok(entry) = result {
            if let Some(ig) = entry.path().parent() {
                // Use override builder to check the path
                let mut override_builder = OverrideBuilder::new(ig);
                if override_builder.add("!**").is_ok() {
                    // Path checking logic
                    let full_path = if check_path.is_absolute() {
                        check_path.to_path_buf()
                    } else {
                        root_path.join(check_path)
                    };

                    // Use a single-file walk to check
                    if full_path.exists() {
                        let check_walker = WalkBuilder::new(&full_path)
                            .hidden(false)
                            .git_ignore(true)
                            .parents(true)
                            .max_depth(Some(0))
                            .build();

                        for check_result in check_walker {
                            match check_result {
                                Ok(_) => return Ok(false), // File was found, not ignored
                                Err(_) => return Ok(true), // Error means likely ignored
                            }
                        }
                    }
                }
            }
        }
        break;
    }

    // Default: try walking from root to the specific path
    let full_path = if check_path.is_absolute() {
        check_path.to_path_buf()
    } else {
        root_path.join(check_path)
    };

    if !full_path.exists() {
        return Ok(false);
    }

    // Walk from root and see if the path appears
    let walker = WalkBuilder::new(root_path)
        .hidden(false)
        .git_ignore(true)
        .max_depth(Some(full_path.components().count()))
        .build();

    for result in walker {
        if let Ok(entry) = result {
            if entry.path() == full_path {
                return Ok(false); // Found it, not ignored
            }
        }
    }

    Ok(true) // Not found in walk, must be ignored
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        // Initialize git repo so .gitignore is recognized
        fs::create_dir_all(root.join(".git")).unwrap();

        // Create directory structure
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/dep")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();

        // Create files
        fs::write(root.join("package.json"), "{}").unwrap();
        fs::write(root.join("src/index.ts"), "console.log('hello');").unwrap();
        fs::write(root.join("src/utils.ts"), "export const x = 1;").unwrap();
        fs::write(root.join("node_modules/dep/index.js"), "module.exports = {};").unwrap();
        fs::write(root.join(".hidden/secret.txt"), "secret").unwrap();

        // Create .gitignore
        fs::write(root.join(".gitignore"), "node_modules/\n.hidden/").unwrap();

        dir
    }

    #[test]
    fn test_list_files_basic() {
        let dir = setup_test_dir();
        let root = dir.path().to_string_lossy().to_string();

        let entries = list_files(root, None).unwrap();
        let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();

        assert!(paths.contains(&"package.json"));
        assert!(paths.contains(&"src/index.ts"));
        assert!(paths.contains(&"src/utils.ts"));
    }

    #[test]
    fn test_list_files_respects_gitignore() {
        let dir = setup_test_dir();
        let root = dir.path().to_string_lossy().to_string();

        let entries = list_files(
            root,
            Some(ListFilesOptions {
                respect_gitignore: Some(true),
                include_hidden: Some(false),
                max_depth: None,
            }),
        )
        .unwrap();

        let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();

        // Should NOT contain gitignored files
        assert!(!paths.iter().any(|p| p.contains("node_modules")));
        assert!(!paths.iter().any(|p| p.contains(".hidden")));
    }

    #[test]
    fn test_list_files_includes_hidden() {
        let dir = setup_test_dir();
        let root = dir.path().to_string_lossy().to_string();

        let entries = list_files(
            root,
            Some(ListFilesOptions {
                respect_gitignore: Some(false),
                include_hidden: Some(true),
                max_depth: None,
            }),
        )
        .unwrap();

        let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();

        // Should contain hidden files
        assert!(paths.iter().any(|p| p.contains(".hidden")));
        assert!(paths.iter().any(|p| p.contains("node_modules")));
    }

    #[test]
    fn test_list_files_max_depth() {
        let dir = setup_test_dir();
        let root = dir.path().to_string_lossy().to_string();

        let entries = list_files(
            root,
            Some(ListFilesOptions {
                max_depth: Some(1),
                include_hidden: Some(false),
                respect_gitignore: Some(true),
            }),
        )
        .unwrap();

        let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();

        // Should contain top-level files
        assert!(paths.contains(&"package.json"));
        // Should contain src directory
        assert!(paths.contains(&"src"));
        // Should NOT contain nested files
        assert!(!paths.contains(&"src/index.ts"));
    }

    #[test]
    fn test_file_entry_has_size() {
        let dir = setup_test_dir();
        let root = dir.path().to_string_lossy().to_string();

        let entries = list_files(root, None).unwrap();
        let package_json = entries.iter().find(|e| e.path == "package.json").unwrap();

        assert_eq!(package_json.entry_type, "file");
        assert!(package_json.size.is_some());
        assert_eq!(package_json.size.unwrap(), 2); // "{}" is 2 bytes
    }

    #[test]
    fn test_nonexistent_path_error() {
        let result = list_files("/nonexistent/path/that/does/not/exist".to_string(), None);
        assert!(result.is_err());
    }
}
