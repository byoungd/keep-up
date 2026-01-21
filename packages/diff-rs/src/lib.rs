use diffy::{apply, DiffOptions, Hunk, Line, Patch};
use napi::{bindgen_prelude::Result as NapiResult, Error as NapiError};
use napi_derive::napi;

const DEFAULT_CONTEXT: usize = 4;

#[napi(object)]
pub struct DiffLine {
    #[napi(js_name = "type")]
    pub line_type: String,
    pub content: String,
    #[napi(js_name = "oldLineNo")]
    pub old_line_no: Option<u32>,
    #[napi(js_name = "newLineNo")]
    pub new_line_no: Option<u32>,
}

#[napi(object)]
pub struct DiffHunk {
    #[napi(js_name = "oldStart")]
    pub old_start: u32,
    #[napi(js_name = "oldLines")]
    pub old_lines: u32,
    #[napi(js_name = "newStart")]
    pub new_start: u32,
    #[napi(js_name = "newLines")]
    pub new_lines: u32,
    pub header: Option<String>,
    pub lines: Vec<DiffLine>,
}

#[napi(js_name = "diffLines")]
pub fn diff_lines(old_text: String, new_text: String) -> Vec<DiffHunk> {
    let patch = build_patch(&old_text, &new_text, DEFAULT_CONTEXT);
    patch.hunks().iter().map(to_diff_hunk).collect()
}

#[napi(js_name = "diffUnified")]
pub fn diff_unified(old_text: String, new_text: String, context: u32) -> String {
    let patch = build_patch(&old_text, &new_text, context as usize);
    format_patch_like_diff("original", "modified", None, None, &patch)
}

#[napi(js_name = "createTwoFilesPatch")]
pub fn create_two_files_patch(
    old_filename: String,
    new_filename: String,
    old_text: String,
    new_text: String,
    old_header: Option<String>,
    new_header: Option<String>,
    context: Option<u32>,
) -> String {
    let context_len = context.map(|value| value as usize).unwrap_or(DEFAULT_CONTEXT);
    let patch = build_patch(&old_text, &new_text, context_len);
    format_patch_like_diff(
        &old_filename,
        &new_filename,
        old_header.as_deref(),
        new_header.as_deref(),
        &patch,
    )
}

#[napi(js_name = "applyPatch")]
pub fn apply_patch(original: String, patch: String) -> NapiResult<String> {
    let parsed = Patch::from_str(&patch).map_err(|error| NapiError::from_reason(error.to_string()))?;
    apply(&original, &parsed).map_err(|error| NapiError::from_reason(error.to_string()))
}

#[napi(js_name = "reversePatch")]
pub fn reverse_patch(patch: String) -> String {
    match Patch::from_str(&patch) {
        Ok(parsed) => parsed.reverse().to_string(),
        Err(_) => patch,
    }
}

fn build_patch<'a>(old_text: &'a str, new_text: &'a str, context: usize) -> Patch<'a, str> {
    let mut options = DiffOptions::new();
    options.set_context_len(context);
    options.create_patch(old_text, new_text)
}

fn to_diff_hunk(hunk: &Hunk<'_, str>) -> DiffHunk {
    let mut old_line = hunk.old_range().start();
    let mut new_line = hunk.new_range().start();
    let mut lines = Vec::with_capacity(hunk.lines().len());

    for line in hunk.lines() {
        match line {
            Line::Context(value) => {
                let content = trim_trailing_newline(value);
                lines.push(DiffLine {
                    line_type: "context".to_string(),
                    content,
                    old_line_no: Some(old_line as u32),
                    new_line_no: Some(new_line as u32),
                });
                old_line += 1;
                new_line += 1;
            }
            Line::Delete(value) => {
                let content = trim_trailing_newline(value);
                lines.push(DiffLine {
                    line_type: "remove".to_string(),
                    content,
                    old_line_no: Some(old_line as u32),
                    new_line_no: None,
                });
                old_line += 1;
            }
            Line::Insert(value) => {
                let content = trim_trailing_newline(value);
                lines.push(DiffLine {
                    line_type: "add".to_string(),
                    content,
                    old_line_no: None,
                    new_line_no: Some(new_line as u32),
                });
                new_line += 1;
            }
        }
    }

    DiffHunk {
        old_start: hunk.old_range().start() as u32,
        old_lines: hunk.old_range().len() as u32,
        new_start: hunk.new_range().start() as u32,
        new_lines: hunk.new_range().len() as u32,
        header: hunk.function_context().map(|value| value.to_string()),
        lines,
    }
}

fn format_patch_like_diff(
    old_filename: &str,
    new_filename: &str,
    old_header: Option<&str>,
    new_header: Option<&str>,
    patch: &Patch<'_, str>,
) -> String {
    let mut output_lines = Vec::new();

    if old_filename == new_filename {
        output_lines.push(format!("Index: {}", old_filename));
    }

    output_lines.push("===================================================================".to_string());
    output_lines.push(format_header("---", old_filename, old_header));
    output_lines.push(format_header("+++", new_filename, new_header));

    for hunk in patch.hunks() {
        let old_start = hunk.old_range().start();
        let new_start = hunk.new_range().start();
        let old_lines = hunk.old_range().len();
        let new_lines = hunk.new_range().len();

        output_lines.push(format!(
            "@@ -{},{} +{},{} @@",
            old_start, old_lines, new_start, new_lines
        ));

        for line in hunk.lines() {
            let (prefix, value) = match line {
                Line::Context(value) => (' ', value),
                Line::Delete(value) => ('-', value),
                Line::Insert(value) => ('+', value),
            };

            let (content, had_newline) = strip_trailing_newline(value);
            output_lines.push(format!("{}{}", prefix, content));
            if !had_newline {
                output_lines.push("\\ No newline at end of file".to_string());
            }
        }
    }

    let mut output = output_lines.join("\n");
    output.push('\n');
    output
}

fn format_header(prefix: &str, filename: &str, header: Option<&str>) -> String {
    match header {
        Some(value) => format!("{} {}\t{}", prefix, filename, value),
        None => format!("{} {}", prefix, filename),
    }
}

fn trim_trailing_newline(value: &str) -> String {
    let (trimmed, _) = strip_trailing_newline(value);
    trimmed.to_string()
}

fn strip_trailing_newline(value: &str) -> (&str, bool) {
    if let Some(trimmed) = value.strip_suffix('\n') {
        (trimmed, true)
    } else {
        (value, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_lines_basic() {
        let old = "hello\nworld\n";
        let new = "hello\nplanet\n";
        let hunks = diff_lines(old.to_string(), new.to_string());

        assert_eq!(hunks.len(), 1);
        let hunk = &hunks[0];
        assert_eq!(hunk.old_start, 1);
        assert_eq!(hunk.new_start, 1);

        let remove_lines: Vec<_> = hunk.lines.iter().filter(|l| l.line_type == "remove").collect();
        let add_lines: Vec<_> = hunk.lines.iter().filter(|l| l.line_type == "add").collect();
        assert_eq!(remove_lines.len(), 1);
        assert_eq!(add_lines.len(), 1);
        assert_eq!(remove_lines[0].content, "world");
        assert_eq!(add_lines[0].content, "planet");
    }

    #[test]
    fn test_diff_lines_identical() {
        let text = "same\ncontent\n";
        let hunks = diff_lines(text.to_string(), text.to_string());
        assert!(hunks.is_empty());
    }

    #[test]
    fn test_diff_lines_empty() {
        let hunks = diff_lines("".to_string(), "".to_string());
        assert!(hunks.is_empty());
    }

    #[test]
    fn test_diff_unified_basic() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nmodified\nline3\n";
        let result = diff_unified(old.to_string(), new.to_string(), 3);

        assert!(result.contains("---"));
        assert!(result.contains("+++"));
        assert!(result.contains("@@"));
        assert!(result.contains("-line2"));
        assert!(result.contains("+modified"));
    }

    #[test]
    fn test_create_two_files_patch_with_headers() {
        let old = "a\n";
        let new = "b\n";
        let result = create_two_files_patch(
            "old.txt".to_string(),
            "new.txt".to_string(),
            old.to_string(),
            new.to_string(),
            Some("2024-01-01".to_string()),
            Some("2024-01-02".to_string()),
            Some(3),
        );

        assert!(result.contains("--- old.txt\t2024-01-01"));
        assert!(result.contains("+++ new.txt\t2024-01-02"));
        assert!(result.contains("-a"));
        assert!(result.contains("+b"));
    }

    #[test]
    fn test_create_two_files_patch_same_filename() {
        let old = "x\n";
        let new = "y\n";
        let result = create_two_files_patch(
            "file.txt".to_string(),
            "file.txt".to_string(),
            old.to_string(),
            new.to_string(),
            None,
            None,
            None,
        );

        assert!(result.contains("Index: file.txt"));
    }

    #[test]
    fn test_apply_patch_success() {
        let original = "line1\nline2\nline3\n";
        let patch = "--- a\n+++ b\n@@ -1,3 +1,3 @@\n line1\n-line2\n+modified\n line3\n";

        let result = apply_patch(original.to_string(), patch.to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "line1\nmodified\nline3\n");
    }

    #[test]
    fn test_apply_patch_invalid() {
        // diffy parses malformed patches as empty patches, so apply succeeds with no changes
        let result = apply_patch("content".to_string(), "not a valid patch".to_string());
        // The result is Ok with unchanged content since the patch has no hunks
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "content");
    }

    #[test]
    fn test_reverse_patch() {
        let patch = "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-old\n+new\n context\n";
        let reversed = reverse_patch(patch.to_string());

        assert!(reversed.contains("+old") || reversed.contains("+ old"));
        assert!(reversed.contains("-new") || reversed.contains("- new"));
    }

    #[test]
    fn test_reverse_patch_invalid() {
        // diffy parses malformed input as empty patch, which reverses to empty string
        let invalid = "not a patch";
        let result = reverse_patch(invalid.to_string());
        // Empty patch reverses to empty string representation
        assert!(result.is_empty() || result == invalid);
    }

    #[test]
    fn test_strip_trailing_newline() {
        assert_eq!(strip_trailing_newline("hello\n"), ("hello", true));
        assert_eq!(strip_trailing_newline("world"), ("world", false));
        assert_eq!(strip_trailing_newline(""), ("", false));
    }

    #[test]
    fn test_trim_trailing_newline() {
        assert_eq!(trim_trailing_newline("hello\n"), "hello");
        assert_eq!(trim_trailing_newline("world"), "world");
    }

    #[test]
    fn test_format_header() {
        assert_eq!(format_header("---", "file.txt", None), "--- file.txt");
        assert_eq!(
            format_header("+++", "file.txt", Some("2024-01-01")),
            "+++ file.txt\t2024-01-01"
        );
    }

    #[test]
    fn test_diff_lines_multiline_changes() {
        let old = "a\nb\nc\nd\ne\n";
        let new = "a\nx\ny\nd\ne\n";
        let hunks = diff_lines(old.to_string(), new.to_string());

        assert!(!hunks.is_empty());
        let hunk = &hunks[0];

        let removes: Vec<_> = hunk.lines.iter().filter(|l| l.line_type == "remove").collect();
        let adds: Vec<_> = hunk.lines.iter().filter(|l| l.line_type == "add").collect();
        assert_eq!(removes.len(), 2);
        assert_eq!(adds.len(), 2);
    }

    #[test]
    fn test_diff_no_newline_at_eof() {
        let old = "line";
        let new = "line\n";
        let result = diff_unified(old.to_string(), new.to_string(), 3);
        assert!(result.contains("\\ No newline at end of file"));
    }
}
