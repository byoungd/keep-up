mod types;

use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose, Engine as _};
use calamine::{open_workbook_auto, Data, Reader as _};
use globset::Glob;
use html2md::parse_html;
use napi::bindgen_prelude::Result;
use napi_derive::napi;
use pdf_extract::extract_text;
use ppt_rs::{create_pptx_with_content, SlideContent};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tiny_http::{Response, Server};
use umya_spreadsheet::{new_file, writer::xlsx::write};
use urlencoding::decode;
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::types::{ToolContent, ToolResult, ToolkitArtifact};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileReadInput {
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum FileEncoding {
    Utf8,
    Base64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileWriteInput {
    path: String,
    content: String,
    encoding: Option<FileEncoding>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileAppendInput {
    path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileListInput {
    path: String,
    pattern: Option<String>,
    recursive: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteCreateInput {
    title: String,
    content: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteAppendInput {
    note_id: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteListInput {
    query: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum ConvertFormat {
    Markdown,
    Text,
    Html,
    Pdf,
    Docx,
    Pptx,
    Xlsx,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConvertInput {
    source_path: String,
    format: ConvertFormat,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PptxSlideInput {
    title: Option<String>,
    content: Option<String>,
    bullets: Option<Vec<String>>,
    notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PptxCreateInput {
    title: String,
    slides: Vec<PptxSlideInput>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CellValue {
    Text(String),
    Number(f64),
    Bool(bool),
}

impl CellValue {
    fn as_string(&self) -> String {
        match self {
            Self::Text(value) => value.clone(),
            Self::Number(value) => {
                if value.fract() == 0.0 {
                    format!("{}", *value as i64)
                } else {
                    value.to_string()
                }
            }
            Self::Bool(value) => value.to_string(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExcelSheetInput {
    name: String,
    rows: Vec<Vec<CellValue>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExcelCreateInput {
    title: String,
    sheets: Vec<ExcelSheetInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaAnalyzeImageInput {
    image_path: String,
    prompt: Option<String>,
    model_route_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaAnalyzeAudioInput {
    audio_path: String,
    prompt: Option<String>,
    model_route_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebDeployInput {
    path: String,
    port: Option<u16>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NoteIndex {
    notes: Vec<NoteEntry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteEntry {
    id: String,
    title: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileListEntry {
    path: String,
    kind: String,
    size: u64,
}

struct WebServerHandle {
    address: String,
    shutdown: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl WebServerHandle {
    fn shutdown(mut self) {
        let _ = self.shutdown.send(());
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

#[napi(js_name = "AgentToolkitRegistry")]
pub struct AgentToolkitRegistry {
    tools: Vec<Value>,
    web_servers: Vec<WebServerHandle>,
}

#[napi]
impl AgentToolkitRegistry {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            tools: build_tool_list(),
            web_servers: Vec::new(),
        }
    }

    #[napi(js_name = "registerAllTools")]
    pub fn register_all_tools(&mut self) {
        if self.tools.is_empty() {
            self.tools = build_tool_list();
        }
    }

    #[napi(js_name = "getToolList")]
    pub fn get_tool_list(&self) -> Result<Value> {
        serde_json::to_value(&self.tools).map_err(to_napi_error)
    }

    #[napi]
    pub fn invoke(&mut self, tool_name: String, payload: Value) -> Result<Value> {
        let workspace_root = match extract_workspace_root(&payload) {
            Ok(root) => root,
            Err(message) => {
                let result = error_result("INVALID_ARGUMENTS", message);
                return serde_json::to_value(result).map_err(to_napi_error);
            }
        };

        let result = match tool_name.as_str() {
            "file.read" => handle_file_read(&payload, &workspace_root),
            "file.write" => handle_file_write(&payload, &workspace_root),
            "file.append" => handle_file_append(&payload, &workspace_root),
            "file.list" => handle_file_list(&payload, &workspace_root),
            "note.create" => handle_note_create(&payload, &workspace_root),
            "note.append" => handle_note_append(&payload, &workspace_root),
            "note.list" => handle_note_list(&payload, &workspace_root),
            "convert.toMarkdown" => handle_convert(&payload, &workspace_root),
            "pptx.create" => handle_pptx_create(&payload, &workspace_root),
            "excel.create" => handle_excel_create(&payload, &workspace_root),
            "media.analyzeImage" => handle_media_image(&payload, &workspace_root),
            "media.analyzeAudio" => handle_media_audio(&payload, &workspace_root),
            "web.deploy" => handle_web_deploy(&payload, &workspace_root, &mut self.web_servers),
            _ => error_result("RESOURCE_NOT_FOUND", format!("Unknown tool: {tool_name}")),
        };

        serde_json::to_value(result).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset(&mut self) {
        let servers = std::mem::take(&mut self.web_servers);
        for server in servers {
            server.shutdown();
        }
    }
}

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

fn parse_input<T: DeserializeOwned>(value: &Value, label: &str) -> std::result::Result<T, String> {
    serde_json::from_value(value.clone())
        .map_err(|error| format!("Invalid {label}: {error}"))
}

fn extract_workspace_root(payload: &Value) -> std::result::Result<PathBuf, String> {
    let root = payload
        .get("workspaceRoot")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "workspaceRoot is required".to_string())?;
    let root_path = PathBuf::from(root);
    root_path
        .canonicalize()
        .map_err(|error| format!("workspaceRoot is invalid: {error}"))
}

fn handle_file_read(payload: &Value, root: &Path) -> ToolResult {
    let input: FileReadInput = match parse_input(payload, "file.read input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    match fs::read(&resolved) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(content) => ToolResult::success(text_content(content)),
            Err(_) => error_result("EXECUTION_FAILED", "File is not valid UTF-8"),
        },
        Err(error) => error_result("EXECUTION_FAILED", format!("Failed to read file: {error}")),
    }
}

fn handle_file_write(payload: &Value, root: &Path) -> ToolResult {
    let input: FileWriteInput = match parse_input(payload, "file.write input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let encoding = input.encoding.unwrap_or(FileEncoding::Utf8);
    let bytes = match encoding {
        FileEncoding::Utf8 => input.content.into_bytes(),
        FileEncoding::Base64 => match general_purpose::STANDARD.decode(input.content) {
            Ok(data) => data,
            Err(_) => return error_result("INVALID_ARGUMENTS", "Invalid base64 content"),
        },
    };

    if let Err(error) = write_atomic(&resolved, &bytes) {
        return error_result("EXECUTION_FAILED", format!("Failed to write file: {error}"));
    }

    let artifact = build_artifact(root, &resolved, &bytes, None);
    let output = json!({
        "path": artifact.path,
        "size": artifact.size,
        "checksum": artifact.checksum,
        "encoding": match encoding {
            FileEncoding::Utf8 => "utf-8",
            FileEncoding::Base64 => "base64",
        },
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_file_append(payload: &Value, root: &Path) -> ToolResult {
    let input: FileAppendInput = match parse_input(payload, "file.append input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let mut existing = match fs::read(&resolved) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => {
            return error_result("EXECUTION_FAILED", format!("Failed to read file: {error}"))
        }
    };

    existing.extend_from_slice(input.content.as_bytes());

    if let Err(error) = write_atomic(&resolved, &existing) {
        return error_result("EXECUTION_FAILED", format!("Failed to append file: {error}"));
    }

    let artifact = build_artifact(root, &resolved, &existing, None);
    let output = json!({
        "path": artifact.path,
        "size": artifact.size,
        "checksum": artifact.checksum,
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_file_list(payload: &Value, root: &Path) -> ToolResult {
    let input: FileListInput = match parse_input(payload, "file.list input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let matcher = match input.pattern {
        Some(pattern) => match Glob::new(&pattern) {
            Ok(glob) => Some(glob.compile_matcher()),
            Err(error) => {
                return error_result("INVALID_ARGUMENTS", format!("Invalid pattern: {error}"))
            }
        },
        None => None,
    };

    let recursive = input.recursive.unwrap_or(false);
    let mut entries: Vec<FileListEntry> = Vec::new();

    if recursive {
        for entry in WalkDir::new(&resolved).min_depth(1).follow_links(false) {
            match entry {
                Ok(item) => {
                    if let Ok(metadata) = item.metadata() {
                        if let Some(entry) = build_list_entry(root, item.path(), &metadata, &matcher)
                        {
                            entries.push(entry);
                        }
                    }
                }
                Err(error) => {
                    return error_result("EXECUTION_FAILED", format!("List failed: {error}"))
                }
            }
        }
    } else {
        let dir_entries = match fs::read_dir(&resolved) {
            Ok(entries) => entries,
            Err(error) => {
                return error_result("EXECUTION_FAILED", format!("List failed: {error}"))
            }
        };

        for entry in dir_entries {
            match entry {
                Ok(item) => {
                    if let Ok(metadata) = item.metadata() {
                        if let Some(entry) = build_list_entry(root, &item.path(), &metadata, &matcher)
                        {
                            entries.push(entry);
                        }
                    }
                }
                Err(error) => {
                    return error_result("EXECUTION_FAILED", format!("List failed: {error}"))
                }
            }
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    let output = json!({
        "count": entries.len(),
        "entries": entries,
    });

    ToolResult::success(text_content(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    ))
}

fn handle_note_create(payload: &Value, root: &Path) -> ToolResult {
    let input: NoteCreateInput = match parse_input(payload, "note.create input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let notes_dir = root.join(".agent-runtime").join("notes");
    if let Err(error) = fs::create_dir_all(&notes_dir) {
        return error_result("EXECUTION_FAILED", format!("Failed to init notes: {error}"));
    }

    let mut index = load_note_index(&notes_dir);
    let base_id = slugify(&input.title);
    let note_id = resolve_unique_note_id(&base_id, &index.notes);
    let note_path = notes_dir.join(format!("{note_id}.md"));

    let content = input.content.unwrap_or_default();
    if let Err(error) = write_atomic(&note_path, content.as_bytes()) {
        return error_result("EXECUTION_FAILED", format!("Failed to write note: {error}"));
    }

    let relative_path = to_relative_path(root, &note_path);
    index.notes.push(NoteEntry {
        id: note_id.clone(),
        title: input.title,
        path: relative_path.clone(),
    });

    if let Err(error) = save_note_index(&notes_dir, &index) {
        return error_result("EXECUTION_FAILED", format!("Failed to update note index: {error}"));
    }

    let artifact = build_artifact(
        root,
        &note_path,
        content.as_bytes(),
        Some("text/markdown".to_string()),
    );
    let output = json!({
        "noteId": note_id,
        "path": relative_path,
        "size": artifact.size,
        "checksum": artifact.checksum,
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_note_append(payload: &Value, root: &Path) -> ToolResult {
    let input: NoteAppendInput = match parse_input(payload, "note.append input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let notes_dir = root.join(".agent-runtime").join("notes");
    let index = load_note_index(&notes_dir);
    let entry = match index.notes.iter().find(|note| note.id == input.note_id) {
        Some(entry) => entry,
        None => return error_result("RESOURCE_NOT_FOUND", "Note not found"),
    };

    let note_path = notes_dir.join(format!("{}.md", entry.id));
    let mut existing = match fs::read(&note_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return error_result("EXECUTION_FAILED", format!("Failed to read note: {error}"))
        }
    };
    existing.extend_from_slice(input.content.as_bytes());

    if let Err(error) = write_atomic(&note_path, &existing) {
        return error_result("EXECUTION_FAILED", format!("Failed to append note: {error}"));
    }

    let artifact = build_artifact(
        root,
        &note_path,
        &existing,
        Some("text/markdown".to_string()),
    );
    let output = json!({
        "noteId": input.note_id,
        "path": entry.path,
        "size": artifact.size,
        "checksum": artifact.checksum,
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_note_list(payload: &Value, root: &Path) -> ToolResult {
    let input: NoteListInput = match parse_input(payload, "note.list input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let notes_dir = root.join(".agent-runtime").join("notes");
    let index = load_note_index(&notes_dir);
    let mut notes = index.notes;

    if let Some(query) = input.query {
        let needle = query.to_lowercase();
        notes.retain(|note| note.title.to_lowercase().contains(&needle));
    }

    notes.sort_by(|a, b| a.id.cmp(&b.id));
    let output = json!({ "notes": notes });

    ToolResult::success(text_content(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    ))
}

fn handle_convert(payload: &Value, root: &Path) -> ToolResult {
    let input: ConvertInput = match parse_input(payload, "convert.toMarkdown input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.source_path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let markdown = match convert_to_markdown(&resolved, input.format) {
        Ok(text) => text,
        Err(message) => return error_result("EXECUTION_FAILED", message),
    };

    ToolResult::success(text_content(markdown))
}

fn handle_pptx_create(payload: &Value, root: &Path) -> ToolResult {
    let input: PptxCreateInput = match parse_input(payload, "pptx.create input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    if input.slides.is_empty() {
        return error_result("INVALID_ARGUMENTS", "slides must not be empty");
    }

    let output_dir = root.join("outputs");
    if let Err(error) = fs::create_dir_all(&output_dir) {
        return error_result(
            "EXECUTION_FAILED",
            format!("Failed to create output directory: {error}"),
        );
    }

    let file_name = format!("{}.pptx", slugify(&input.title));
    let output_path = output_dir.join(file_name);

    let mut slides: Vec<SlideContent> = Vec::new();
    for (index, slide) in input.slides.iter().enumerate() {
        let title = slide
            .title
            .clone()
            .unwrap_or_else(|| format!("Slide {}", index + 1));
        let mut content = SlideContent::new(&title);
        if let Some(text) = &slide.content {
            content.content.push(text.clone());
        }
        if let Some(bullets) = &slide.bullets {
            for bullet in bullets {
                content = content.add_bullet(bullet);
            }
        }
        if let Some(notes) = &slide.notes {
            content.notes = Some(notes.clone());
        }
        slides.push(content);
    }

    let bytes = match create_pptx_with_content(&input.title, slides) {
        Ok(data) => data,
        Err(error) => {
            return error_result(
                "EXECUTION_FAILED",
                format!("Failed to generate PPTX: {error}"),
            )
        }
    };

    if let Err(error) = write_atomic(&output_path, &bytes) {
        return error_result("EXECUTION_FAILED", format!("Failed to write PPTX: {error}"));
    }

    let artifact = build_artifact(root, &output_path, &bytes, Some("application/vnd.openxmlformats-officedocument.presentationml.presentation".to_string()));
    let output = json!({
        "path": artifact.path,
        "size": artifact.size,
        "checksum": artifact.checksum,
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_excel_create(payload: &Value, root: &Path) -> ToolResult {
    let input: ExcelCreateInput = match parse_input(payload, "excel.create input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    if input.sheets.is_empty() {
        return error_result("INVALID_ARGUMENTS", "sheets must not be empty");
    }

    let output_dir = root.join("outputs");
    if let Err(error) = fs::create_dir_all(&output_dir) {
        return error_result(
            "EXECUTION_FAILED",
            format!("Failed to create output directory: {error}"),
        );
    }

    let file_name = format!("{}.xlsx", slugify(&input.title));
    let output_path = output_dir.join(file_name);

    let mut workbook = new_file();

    for (index, sheet) in input.sheets.iter().enumerate() {
        let sheet_name = if sheet.name.trim().is_empty() {
            format!("Sheet{}", index + 1)
        } else {
            sheet.name.clone()
        };

        if index == 0 {
            if let Some(worksheet) = workbook.get_sheet_by_name_mut("Sheet1") {
                worksheet.set_name(sheet_name.clone());
            }
        } else {
            let _ = workbook.new_sheet(&sheet_name);
        }

        if let Some(worksheet) = workbook.get_sheet_by_name_mut(&sheet_name) {
            for (row_index, row) in sheet.rows.iter().enumerate() {
                for (col_index, cell) in row.iter().enumerate() {
                    let row_num = row_index + 1;
                    let col_num = col_index + 1;
                    let value = cell.as_string();
                    worksheet
                        .get_cell_mut((col_num as u32, row_num as u32))
                        .set_value(value);
                }
            }
        }
    }

    if let Err(error) = write(&workbook, &output_path) {
        return error_result("EXECUTION_FAILED", format!("Failed to write Excel: {error}"));
    }

    let bytes = match fs::read(&output_path) {
        Ok(data) => data,
        Err(error) => {
            return error_result(
                "EXECUTION_FAILED",
                format!("Failed to read Excel output: {error}"),
            )
        }
    };

    let artifact = build_artifact(root, &output_path, &bytes, Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()));
    let output = json!({
        "path": artifact.path,
        "size": artifact.size,
        "checksum": artifact.checksum,
    });

    ToolResult::success_with_artifacts(
        text_content(serde_json::to_string_pretty(&output).unwrap_or_default()),
        vec![artifact],
    )
}

fn handle_media_image(payload: &Value, root: &Path) -> ToolResult {
    let input: MediaAnalyzeImageInput = match parse_input(payload, "media.analyzeImage input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.image_path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let bytes = match fs::read(&resolved) {
        Ok(data) => data,
        Err(error) => {
            return error_result("EXECUTION_FAILED", format!("Failed to read image: {error}"))
        }
    };

    let checksum = compute_checksum(&bytes);
    let output = json!({
        "path": to_relative_path(root, &resolved),
        "size": bytes.len(),
        "checksum": checksum,
        "prompt": input.prompt,
        "modelRouteId": input.model_route_id,
        "summary": "Image analysis completed with deterministic metadata.",
    });

    ToolResult::success(text_content(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    ))
}

fn handle_media_audio(payload: &Value, root: &Path) -> ToolResult {
    let input: MediaAnalyzeAudioInput = match parse_input(payload, "media.analyzeAudio input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.audio_path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let bytes = match fs::read(&resolved) {
        Ok(data) => data,
        Err(error) => {
            return error_result("EXECUTION_FAILED", format!("Failed to read audio: {error}"))
        }
    };

    let checksum = compute_checksum(&bytes);
    let output = json!({
        "path": to_relative_path(root, &resolved),
        "size": bytes.len(),
        "checksum": checksum,
        "prompt": input.prompt,
        "modelRouteId": input.model_route_id,
        "summary": "Audio analysis completed with deterministic metadata.",
    });

    ToolResult::success(text_content(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    ))
}

fn handle_web_deploy(
    payload: &Value,
    root: &Path,
    servers: &mut Vec<WebServerHandle>,
) -> ToolResult {
    let input: WebDeployInput = match parse_input(payload, "web.deploy input") {
        Ok(value) => value,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let resolved = match resolve_workspace_path(root, &input.path) {
        Ok(path) => path,
        Err(message) => return error_result("INVALID_ARGUMENTS", message),
    };

    let server = match start_web_server(resolved, input.port) {
        Ok(handle) => handle,
        Err(message) => return error_result("EXECUTION_FAILED", message),
    };

    let output = json!({ "url": server.address });
    servers.push(server);

    ToolResult::success(text_content(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    ))
}

fn write_atomic(path: &Path, data: &[u8]) -> std::result::Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temp_path = create_temp_path(path);
    {
        let mut file = File::create(&temp_path).map_err(|error| error.to_string())?;
        file.write_all(data).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }

    fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
    Ok(())
}

fn create_temp_path(path: &Path) -> PathBuf {
    let mut candidate = path.with_extension("tmp");
    let mut counter = 0;
    while candidate.exists() {
        counter += 1;
        candidate = path.with_extension(format!("tmp{counter}"));
    }
    candidate
}

fn resolve_workspace_path(root: &Path, input: &str) -> std::result::Result<PathBuf, String> {
    if input.trim().is_empty() {
        return Err("Path is required".to_string());
    }

    let sanitized = sanitize_path(Path::new(input))?;
    let root = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace root: {error}"))?;

    let candidate = if sanitized.is_absolute() {
        sanitized
    } else {
        root.join(sanitized)
    };

    if !candidate.starts_with(&root) {
        return Err("Path is outside workspace root".to_string());
    }

    Ok(candidate)
}

fn sanitize_path(path: &Path) -> std::result::Result<PathBuf, String> {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => return Err("Path traversal is not allowed".to_string()),
            Component::CurDir => {}
            Component::Normal(value) => output.push(value),
            Component::RootDir | Component::Prefix(_) => output.push(component.as_os_str()),
        }
    }
    Ok(output)
}

fn build_list_entry(
    root: &Path,
    path: &Path,
    metadata: &fs::Metadata,
    matcher: &Option<globset::GlobMatcher>,
) -> Option<FileListEntry> {
    let relative = to_relative_path(root, path);
    if let Some(matcher) = matcher {
        let normalized = relative.replace('\\', "/");
        if !matcher.is_match(&normalized) {
            return None;
        }
    }

    Some(FileListEntry {
        path: relative,
        kind: if metadata.is_dir() { "directory".to_string() } else { "file".to_string() },
        size: metadata.len(),
    })
}

fn to_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn build_artifact(
    root: &Path,
    path: &Path,
    data: &[u8],
    mime_type: Option<String>,
) -> ToolkitArtifact {
    ToolkitArtifact {
        path: to_relative_path(root, path),
        size: data.len() as u64,
        checksum: compute_checksum(data),
        mime_type,
        title: None,
    }
}

fn compute_checksum(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn convert_to_markdown(path: &Path, format: ConvertFormat) -> std::result::Result<String, String> {
    match format {
        ConvertFormat::Markdown | ConvertFormat::Text => {
            let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
            Ok(normalize_markdown(&content))
        }
        ConvertFormat::Html => {
            let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
            Ok(normalize_markdown(&parse_html(&content)))
        }
        ConvertFormat::Pdf => {
            let content = extract_text(path).map_err(|error| error.to_string())?;
            Ok(normalize_markdown(&content))
        }
        ConvertFormat::Docx => {
            let content = extract_docx_text(path)?;
            Ok(normalize_markdown(&content))
        }
        ConvertFormat::Pptx => {
            let content = extract_pptx_text(path)?;
            Ok(normalize_markdown(&content))
        }
        ConvertFormat::Xlsx => {
            let content = extract_xlsx_text(path)?;
            Ok(normalize_markdown(&content))
        }
    }
}

fn extract_docx_text(path: &Path) -> std::result::Result<String, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let mut document = archive
        .by_name("word/document.xml")
        .map_err(|error| error.to_string())?;
    let mut xml = String::new();
    document.read_to_string(&mut xml).map_err(|error| error.to_string())?;

    let mut reader = XmlReader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut output = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                if event.name().as_ref().ends_with(b"p") {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                }
            }
            Ok(Event::Text(event)) => {
                let text = event.decode().map_err(|error| error.to_string())?;
                if !output.ends_with('\n') && !output.is_empty() {
                    output.push(' ');
                }
                output.push_str(&text);
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(error.to_string()),
            _ => {}
        }
        buf.clear();
    }

    Ok(output)
}

fn extract_pptx_text(path: &Path) -> std::result::Result<String, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;

    let mut slide_names: Vec<String> = archive
        .file_names()
        .filter(|name| name.starts_with("ppt/slides/slide"))
        .map(|name| name.to_string())
        .collect();

    slide_names.sort_by(|a, b| slide_sort_key(a).cmp(&slide_sort_key(b)));

    let mut output = String::new();

    for (index, slide_name) in slide_names.iter().enumerate() {
        let mut slide = archive
            .by_name(slide_name)
            .map_err(|error| error.to_string())?;
        let mut xml = String::new();
        slide.read_to_string(&mut xml).map_err(|error| error.to_string())?;
        let mut reader = XmlReader::from_str(&xml);
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();
        let mut slide_text = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Text(event)) => {
                    let text = event.decode().map_err(|error| error.to_string())?;
                    if !slide_text.is_empty() {
                        slide_text.push(' ');
                    }
                    slide_text.push_str(&text);
                }
                Ok(Event::Eof) => break,
                Err(error) => return Err(error.to_string()),
                _ => {}
            }
            buf.clear();
        }

        if !output.is_empty() {
            output.push_str("\n\n");
        }
        output.push_str(&format!("## Slide {}\n", index + 1));
        output.push_str(&slide_text);
    }

    Ok(output)
}

fn slide_sort_key(name: &str) -> usize {
    name.trim_start_matches("ppt/slides/slide")
        .trim_end_matches(".xml")
        .parse::<usize>()
        .unwrap_or(0)
}

fn extract_xlsx_text(path: &Path) -> std::result::Result<String, String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_owned();
    let mut output = String::new();

    for sheet_name in sheet_names {
        if !output.is_empty() {
            output.push_str("\n\n");
        }
        output.push_str(&format!("## {sheet_name}\n"));

        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| error.to_string())?;

        if range.height() == 0 || range.width() == 0 {
            output.push_str("(empty sheet)");
            continue;
        }

        let rows: Vec<Vec<String>> = range
            .rows()
            .map(|row| row.iter().map(cell_to_string).collect())
            .collect();

        let column_count = rows.iter().map(|row| row.len()).max().unwrap_or(0);
        if column_count == 0 {
            output.push_str("(empty sheet)");
            continue;
        }

        let header = rows.first().cloned().unwrap_or_default();
        output.push_str(&format!("| {} |\n", pad_row(&header, column_count).join(" | ")));
        output.push_str(&format!("| {} |\n", vec!["---"; column_count].join(" | ")));

        for row in rows.iter().skip(1) {
            output.push_str(&format!("| {} |\n", pad_row(row, column_count).join(" | ")));
        }
    }

    Ok(output)
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => "".to_string(),
        Data::String(value) => value.clone(),
        Data::Float(value) => {
            if value.fract() == 0.0 {
                format!("{}", *value as i64)
            } else {
                value.to_string()
            }
        }
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => value.to_string(),
        Data::Error(value) => format!("Error({value:?})"),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) => value.clone(),
        Data::DurationIso(value) => value.clone(),
    }
}

fn pad_row(row: &[String], column_count: usize) -> Vec<String> {
    let mut padded = row.to_vec();
    while padded.len() < column_count {
        padded.push(String::new());
    }
    padded
}

fn normalize_markdown(input: &str) -> String {
    let lines: Vec<String> = input
        .replace('\r', "")
        .lines()
        .map(|line| line.trim_end().to_string())
        .collect();
    let mut normalized: Vec<String> = Vec::with_capacity(lines.len());
    let mut index = 0;
    while index < lines.len() {
        let line = &lines[index];
        if index + 1 < lines.len() {
            let underline = lines[index + 1].trim();
            if !line.trim().is_empty() && is_setext_underline(underline, '=') {
                normalized.push(format!("# {}", line.trim()));
                index += 2;
                continue;
            }
            if !line.trim().is_empty() && is_setext_underline(underline, '-') {
                normalized.push(format!("## {}", line.trim()));
                index += 2;
                continue;
            }
        }
        normalized.push(line.clone());
        index += 1;
    }
    let mut lines = normalized;
    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

fn is_setext_underline(line: &str, marker: char) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed.chars().all(|char| char == marker)
}

fn load_note_index(notes_dir: &Path) -> NoteIndex {
    let index_path = notes_dir.join("index.json");
    if let Ok(contents) = fs::read_to_string(index_path) {
        if let Ok(index) = serde_json::from_str::<NoteIndex>(&contents) {
            return index;
        }
    }
    NoteIndex::default()
}

fn save_note_index(notes_dir: &Path, index: &NoteIndex) -> std::result::Result<(), String> {
    let index_path = notes_dir.join("index.json");
    let contents = serde_json::to_string_pretty(index).map_err(|error| error.to_string())?;
    write_atomic(&index_path, contents.as_bytes())
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "note".to_string()
    } else {
        trimmed
    }
}

fn resolve_unique_note_id(base: &str, existing: &[NoteEntry]) -> String {
    if existing.iter().all(|note| note.id != base) {
        return base.to_string();
    }

    let mut counter = 2;
    loop {
        let candidate = format!("{base}-{counter}");
        if existing.iter().all(|note| note.id != candidate) {
            return candidate;
        }
        counter += 1;
    }
}

fn start_web_server(
    root: PathBuf,
    port: Option<u16>,
) -> std::result::Result<WebServerHandle, String> {
    let listener = TcpListener::bind(("127.0.0.1", port.unwrap_or(0)))
        .map_err(|error| error.to_string())?;
    let address = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .to_string();
    let server = Server::from_listener(listener, None).map_err(|error| error.to_string())?;

    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    let thread_root = root.clone();
    let thread = thread::spawn(move || loop {
        if shutdown_rx.try_recv().is_ok() {
            break;
        }
        match server.recv_timeout(Duration::from_millis(200)) {
            Ok(Some(request)) => {
                handle_web_request(request, &thread_root);
            }
            Ok(None) => continue,
            Err(_) => break,
        }
    });

    Ok(WebServerHandle {
        address: format!("http://{address}"),
        shutdown: shutdown_tx,
        thread: Some(thread),
    })
}

fn handle_web_request(request: tiny_http::Request, root: &Path) {
    let url = request.url();
    let path = url.split('?').next().unwrap_or("/");
    let decoded = decode(path).unwrap_or_else(|_| "/".into());
    let mut relative = decoded.trim_start_matches('/').to_string();
    if relative.is_empty() {
        relative = ".".to_string();
    }

    let resolved = match resolve_workspace_path(root, &relative) {
        Ok(path) => path,
        Err(_) => {
            let _ = request.respond(Response::from_string("Forbidden").with_status_code(403));
            return;
        }
    };

    let target = if resolved.is_dir() {
        resolved.join("index.html")
    } else {
        resolved
    };

    match fs::read(&target) {
        Ok(contents) => {
            let _ = request.respond(Response::from_data(contents));
        }
        Err(_) => {
            let _ = request.respond(Response::from_string("Not found").with_status_code(404));
        }
    }
}

fn build_tool_list() -> Vec<Value> {
    vec![
        tool_definition(
            "file.read",
            "Read file contents from the workspace.",
            json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"],
                "additionalProperties": false
            }),
            "file.read",
            true,
        ),
        tool_definition(
            "file.write",
            "Write file contents to the workspace.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "encoding": { "type": "string", "enum": ["utf8", "base64"] }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
            "file.write",
            false,
        ),
        tool_definition(
            "file.append",
            "Append content to a file.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
            "file.write",
            false,
        ),
        tool_definition(
            "file.list",
            "List files under a directory.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "pattern": { "type": "string" },
                    "recursive": { "type": "boolean" }
                },
                "required": ["path"],
                "additionalProperties": false
            }),
            "file.read",
            true,
        ),
        tool_definition(
            "note.create",
            "Create a markdown note.",
            json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["title"],
                "additionalProperties": false
            }),
            "connector.action",
            false,
        ),
        tool_definition(
            "note.append",
            "Append content to a markdown note.",
            json!({
                "type": "object",
                "properties": {
                    "noteId": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["noteId", "content"],
                "additionalProperties": false
            }),
            "connector.action",
            false,
        ),
        tool_definition(
            "note.list",
            "List available notes.",
            json!({
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "additionalProperties": false
            }),
            "connector.read",
            true,
        ),
        tool_definition(
            "convert.toMarkdown",
            "Convert supported files to markdown.",
            json!({
                "type": "object",
                "properties": {
                    "sourcePath": { "type": "string" },
                    "format": {
                        "type": "string",
                        "enum": ["markdown", "text", "html", "pdf", "docx", "pptx", "xlsx"]
                    }
                },
                "required": ["sourcePath", "format"],
                "additionalProperties": false
            }),
            "file.read",
            true,
        ),
        tool_definition(
            "pptx.create",
            "Generate a PPTX presentation.",
            json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "slides": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": { "type": "string" },
                                "content": { "type": "string" },
                                "bullets": { "type": "array", "items": { "type": "string" } },
                                "notes": { "type": "string" }
                            },
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["title", "slides"],
                "additionalProperties": false
            }),
            "connector.action",
            false,
        ),
        tool_definition(
            "excel.create",
            "Generate an Excel workbook.",
            json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "sheets": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "rows": {
                                    "type": "array",
                                    "items": {
                                        "type": "array",
                                        "items": {
                                            "oneOf": [
                                                { "type": "string" },
                                                { "type": "number" },
                                                { "type": "boolean" }
                                            ]
                                        }
                                    }
                                }
                            },
                            "required": ["name", "rows"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["title", "sheets"],
                "additionalProperties": false
            }),
            "connector.action",
            false,
        ),
        tool_definition(
            "media.analyzeImage",
            "Analyze an image with deterministic metadata.",
            json!({
                "type": "object",
                "properties": {
                    "imagePath": { "type": "string" },
                    "prompt": { "type": "string" },
                    "modelRouteId": { "type": "string" }
                },
                "required": ["imagePath"],
                "additionalProperties": false
            }),
            "file.read",
            true,
        ),
        tool_definition(
            "media.analyzeAudio",
            "Analyze audio with deterministic metadata.",
            json!({
                "type": "object",
                "properties": {
                    "audioPath": { "type": "string" },
                    "prompt": { "type": "string" },
                    "modelRouteId": { "type": "string" }
                },
                "required": ["audioPath"],
                "additionalProperties": false
            }),
            "file.read",
            true,
        ),
        tool_definition(
            "web.deploy",
            "Serve a local directory for preview.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "port": { "type": "number" }
                },
                "required": ["path"],
                "additionalProperties": false
            }),
            "file.read",
            false,
        ),
    ]
}

fn tool_definition(
    name: &str,
    description: &str,
    input_schema: Value,
    policy_action: &str,
    read_only: bool,
) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema,
        "annotations": {
            "category": "core",
            "requiresConfirmation": false,
            "readOnly": read_only,
            "estimatedDuration": "fast",
            "policyAction": policy_action,
        }
    })
}

fn text_content(text: String) -> Vec<ToolContent> {
    vec![ToolContent::text(text)]
}

fn error_result(code: &str, message: impl Into<String>) -> ToolResult {
    ToolResult::error(code, message.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_path_traversal() {
        let dir = tempdir().expect("tempdir");
        let root = dir.path().canonicalize().expect("root");
        let result = resolve_workspace_path(&root, "../secrets.txt");
        assert!(result.is_err());
    }

    #[test]
    fn file_write_and_read_roundtrip() {
        let dir = tempdir().expect("tempdir");
        let root = dir.path().canonicalize().expect("root");
        let path = root.join("notes").join("roundtrip.txt");
        let content = b"hello";

        write_atomic(&path, content).expect("write");
        let read = fs::read(&path).expect("read");
        assert_eq!(read, content);
    }

    #[test]
    fn markdown_conversion_is_deterministic() {
        let html = "<h1>Title</h1><p>Body</p>";
        let first = normalize_markdown(&parse_html(html));
        let second = normalize_markdown(&parse_html(html));
        assert_eq!(first, second);
        assert_eq!(first, "# Title\n\nBody");
    }
}
