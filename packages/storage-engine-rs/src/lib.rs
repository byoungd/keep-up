use fs2::FileExt;
use memmap2::MmapOptions;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tempfile::NamedTempFile;
use unicode_normalization::UnicodeNormalization;

const EVENT_LOG_FILE: &str = "events.log";
const CHECKPOINT_DIR: &str = "checkpoints";
const LOCK_FILE: &str = ".storage.lock";
const EVENT_HEADER_SIZE: usize = 12;

#[derive(Clone, Debug)]
pub struct Event {
  pub payload: Vec<u8>,
}

type StorageResult<T> = std::result::Result<T, String>;

pub trait StorageEngine {
  fn save_checkpoint(&self, id: &str, data: &[u8]) -> StorageResult<()>;
  fn load_checkpoint(&self, id: &str) -> StorageResult<Vec<u8>>;
  fn append_event(&self, event: &Event) -> StorageResult<u64>;
  fn replay_events(&self, from: u64) -> StorageResult<Vec<Event>>;
  fn prune(&self, before: u64) -> StorageResult<usize>;
}

struct EngineState {
  root_dir: PathBuf,
  event_log_path: PathBuf,
  checkpoint_dir: PathBuf,
  lock_path: PathBuf,
  next_event_seq: u64,
}

struct FileStorageEngine {
  state: Mutex<EngineState>,
}

impl FileStorageEngine {
  fn new(root_dir: PathBuf) -> StorageResult<Self> {
    fs::create_dir_all(&root_dir).map_err(to_storage_error)?;
    let checkpoint_dir = root_dir.join(CHECKPOINT_DIR);
    fs::create_dir_all(&checkpoint_dir).map_err(to_storage_error)?;
    let event_log_path = root_dir.join(EVENT_LOG_FILE);
    let lock_path = root_dir.join(LOCK_FILE);
    let next_event_seq = scan_event_log(&event_log_path)?;

    Ok(Self {
      state: Mutex::new(EngineState {
        root_dir,
        event_log_path,
        checkpoint_dir,
        lock_path,
        next_event_seq,
      }),
    })
  }

  fn save_checkpoint_bytes(&self, id: &str, data: &[u8]) -> StorageResult<()> {
    let key = sanitize_key(id)?;
    let (checkpoint_dir, lock_path) = {
      let state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      (state.checkpoint_dir.clone(), state.lock_path.clone())
    };
    let _lock = lock_file(&lock_path, true)?;
    fs::create_dir_all(&checkpoint_dir).map_err(to_storage_error)?;

    let compressed = compress_payload(data)?;
    let mut temp = NamedTempFile::new_in(&checkpoint_dir).map_err(to_storage_error)?;
    temp.write_all(&compressed).map_err(to_storage_error)?;
    temp.flush().map_err(to_storage_error)?;

    let final_path = checkpoint_dir.join(key);
    if final_path.exists() {
      fs::remove_file(&final_path).map_err(to_storage_error)?;
    }

    temp.persist(&final_path)
      .map_err(|err| err.error.to_string())?;

    Ok(())
  }

  fn load_checkpoint_bytes(&self, id: &str) -> StorageResult<Option<Vec<u8>>> {
    let key = sanitize_key(id)?;
    let (checkpoint_dir, lock_path) = {
      let state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      (state.checkpoint_dir.clone(), state.lock_path.clone())
    };

    let path = checkpoint_dir.join(key);
    if !path.exists() {
      return Ok(None);
    }

    let _lock = lock_file(&lock_path, false)?;
    let data = fs::read(&path).map_err(to_storage_error)?;
    let decompressed = decompress_payload(&data)?;
    Ok(Some(decompressed))
  }

  fn delete_checkpoint_file(&self, id: &str) -> StorageResult<bool> {
    let key = sanitize_key(id)?;
    let (checkpoint_dir, lock_path) = {
      let state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      (state.checkpoint_dir.clone(), state.lock_path.clone())
    };

    let path = checkpoint_dir.join(key);
    let _lock = lock_file(&lock_path, true)?;
    match fs::remove_file(&path) {
      Ok(()) => Ok(true),
      Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
      Err(err) => Err(err.to_string()),
    }
  }

  fn append_event_bytes(&self, data: &[u8]) -> StorageResult<u64> {
    if data.len() > u32::MAX as usize {
      return Err("Event payload exceeds u32::MAX".to_string());
    }

    let (event_log_path, lock_path, seq) = {
      let mut state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      let seq = state.next_event_seq;
      state.next_event_seq = state.next_event_seq.saturating_add(1);
      (state.event_log_path.clone(), state.lock_path.clone(), seq)
    };

    let _lock = lock_file(&lock_path, true)?;
    let mut file = OpenOptions::new()
      .create(true)
      .append(true)
      .open(&event_log_path)
      .map_err(to_storage_error)?;

    file.write_all(&seq.to_le_bytes()).map_err(to_storage_error)?;
    let len = data.len() as u32;
    file.write_all(&len.to_le_bytes()).map_err(to_storage_error)?;
    file.write_all(data).map_err(to_storage_error)?;
    file.flush().map_err(to_storage_error)?;
    file.sync_data().map_err(to_storage_error)?;

    Ok(seq)
  }

  fn replay_event_bytes(&self, from: u64, limit: Option<usize>) -> StorageResult<Vec<Vec<u8>>> {
    let (event_log_path, lock_path) = {
      let state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      (state.event_log_path.clone(), state.lock_path.clone())
    };

    if !event_log_path.exists() {
      return Ok(Vec::new());
    }

    let _lock = lock_file(&lock_path, false)?;
    let file = File::open(&event_log_path).map_err(to_storage_error)?;
    let metadata = file.metadata().map_err(to_storage_error)?;
    if metadata.len() == 0 {
      return Ok(Vec::new());
    }

    let mmap = unsafe { MmapOptions::new().map(&file).map_err(to_storage_error)? };
    let mut cursor = 0usize;
    let mut events = Vec::new();

    while cursor + EVENT_HEADER_SIZE <= mmap.len() {
      let seq = read_u64(&mmap[cursor..cursor + 8]);
      cursor += 8;
      let len = read_u32(&mmap[cursor..cursor + 4]) as usize;
      cursor += 4;

      if cursor + len > mmap.len() {
        break;
      }

      if seq >= from {
        events.push(mmap[cursor..cursor + len].to_vec());
        if let Some(max) = limit {
          if events.len() >= max {
            break;
          }
        }
      }

      cursor += len;
    }

    Ok(events)
  }

  fn prune_event_log(&self, before: u64) -> StorageResult<u64> {
    let (event_log_path, lock_path, root_dir) = {
      let state = self.state.lock().map_err(|_| "Storage lock poisoned".to_string())?;
      (
        state.event_log_path.clone(),
        state.lock_path.clone(),
        state.root_dir.clone(),
      )
    };

    if !event_log_path.exists() {
      return Ok(0);
    }

    let _lock = lock_file(&lock_path, true)?;
    let file = File::open(&event_log_path).map_err(to_storage_error)?;
    let metadata = file.metadata().map_err(to_storage_error)?;
    if metadata.len() == 0 {
      return Ok(0);
    }

    let mmap = unsafe { MmapOptions::new().map(&file).map_err(to_storage_error)? };
    let mut cursor = 0usize;
    let mut removed = 0u64;
    let mut kept_offset: Option<usize> = None;
    let mut last_valid_offset = 0usize;

    while cursor + EVENT_HEADER_SIZE <= mmap.len() {
      let record_start = cursor;
      let seq = read_u64(&mmap[cursor..cursor + 8]);
      cursor += 8;
      let len = read_u32(&mmap[cursor..cursor + 4]) as usize;
      cursor += 4;

      if cursor + len > mmap.len() {
        break;
      }

      if seq < before {
        removed += 1;
      } else if kept_offset.is_none() {
        kept_offset = Some(record_start);
      }

      cursor += len;
      last_valid_offset = cursor;
    }

    if removed == 0 {
      return Ok(0);
    }

    let start_offset = kept_offset.unwrap_or(last_valid_offset);
    let mut temp = NamedTempFile::new_in(&root_dir).map_err(to_storage_error)?;

    if start_offset < mmap.len() {
      temp
        .write_all(&mmap[start_offset..])
        .map_err(to_storage_error)?;
      temp.flush().map_err(to_storage_error)?;
    }

    temp.persist(&event_log_path)
      .map_err(|err| err.error.to_string())?;

    Ok(removed)
  }
}

impl StorageEngine for FileStorageEngine {
  fn save_checkpoint(&self, id: &str, data: &[u8]) -> StorageResult<()> {
    self.save_checkpoint_bytes(id, data)
  }

  fn load_checkpoint(&self, id: &str) -> StorageResult<Vec<u8>> {
    self.load_checkpoint_bytes(id)?
      .ok_or_else(|| "Checkpoint not found".to_string())
  }

  fn append_event(&self, event: &Event) -> StorageResult<u64> {
    self.append_event_bytes(&event.payload)
  }

  fn replay_events(&self, from: u64) -> StorageResult<Vec<Event>> {
    let events = self
      .replay_event_bytes(from, None)?
      .into_iter()
      .map(|payload| Event { payload })
      .collect();
    Ok(events)
  }

  fn prune(&self, before: u64) -> StorageResult<usize> {
    Ok(self.prune_event_log(before)? as usize)
  }
}

#[napi(js_name = "StorageEngine")]
pub struct StorageEngineHandle {
  inner: Arc<FileStorageEngine>,
}

#[napi]
impl StorageEngineHandle {
  #[napi(constructor)]
  pub fn new(root_dir: String) -> Result<Self> {
    let normalized = normalize_root_path(&root_dir).map_err(to_napi_error)?;
    let engine = FileStorageEngine::new(normalized).map_err(to_napi_error)?;
    Ok(Self {
      inner: Arc::new(engine),
    })
  }

  #[napi]
  pub fn save_checkpoint(&self, id: String, data: Buffer) -> Result<()> {
    self
      .inner
      .save_checkpoint_bytes(&id, data.as_ref())
      .map_err(to_napi_error)
  }

  #[napi]
  pub fn load_checkpoint(&self, id: String) -> Result<Option<Buffer>> {
    let payload = self
      .inner
      .load_checkpoint_bytes(&id)
      .map_err(to_napi_error)?;
    Ok(payload.map(Buffer::from))
  }

  #[napi]
  pub fn delete_checkpoint(&self, id: String) -> Result<bool> {
    self
      .inner
      .delete_checkpoint_file(&id)
      .map_err(to_napi_error)
  }

  #[napi]
  pub fn append_event(&self, data: Buffer) -> Result<BigInt> {
    let seq = self
      .inner
      .append_event_bytes(data.as_ref())
      .map_err(to_napi_error)?;
    Ok(big_int_from_u64(seq))
  }

  #[napi]
  pub fn replay_events(&self, from: BigInt, limit: Option<u32>) -> Result<Vec<Buffer>> {
    let from_seq = big_int_to_u64(&from, "from")?;
    let events = self
      .inner
      .replay_event_bytes(from_seq, limit.map(|value| value as usize))
      .map_err(to_napi_error)?;
    Ok(events.into_iter().map(Buffer::from).collect())
  }

  #[napi]
  pub fn prune_events(&self, before: BigInt) -> Result<BigInt> {
    let before_seq = big_int_to_u64(&before, "before")?;
    let removed = self
      .inner
      .prune_event_log(before_seq)
      .map_err(to_napi_error)?;
    Ok(big_int_from_u64(removed))
  }
}

fn normalize_root_path(input: &str) -> StorageResult<PathBuf> {
  let normalized = input.nfc().collect::<String>();
  let path = PathBuf::from(normalized);
  let absolute = if path.is_absolute() {
    path
  } else {
    let current = std::env::current_dir().map_err(to_storage_error)?;
    current.join(path)
  };

  Ok(apply_long_path_prefix(absolute))
}

#[cfg(windows)]
fn apply_long_path_prefix(path: PathBuf) -> PathBuf {
  let path_str = path.to_string_lossy();
  if path_str.starts_with(r"\\?\") {
    return path;
  }
  if path_str.len() > 240 {
    return PathBuf::from(format!(r"\\?\{}", path_str));
  }
  path
}

#[cfg(not(windows))]
fn apply_long_path_prefix(path: PathBuf) -> PathBuf {
  path
}

fn sanitize_key(key: &str) -> StorageResult<String> {
  if key.is_empty() {
    return Err("Storage key cannot be empty".to_string());
  }
  if key.contains('/') || key.contains('\\') {
    return Err("Storage key cannot contain path separators".to_string());
  }
  if key.contains("..") {
    return Err("Storage key cannot contain parent traversal".to_string());
  }
  Ok(key.to_string())
}

fn lock_file(lock_path: &Path, write: bool) -> StorageResult<File> {
  let file = OpenOptions::new()
    .create(true)
    .read(true)
    .write(true)
    .open(lock_path)
    .map_err(to_storage_error)?;

  if write {
    file.lock_exclusive().map_err(to_storage_error)?;
  } else {
    file.lock_shared().map_err(to_storage_error)?;
  }

  Ok(file)
}

fn compress_payload(data: &[u8]) -> StorageResult<Vec<u8>> {
  zstd::stream::encode_all(data, 3).map_err(|err| err.to_string())
}

fn decompress_payload(data: &[u8]) -> StorageResult<Vec<u8>> {
  zstd::stream::decode_all(data).map_err(|err| err.to_string())
}

fn scan_event_log(path: &Path) -> StorageResult<u64> {
  if !path.exists() {
    return Ok(0);
  }

  let file = File::open(path).map_err(to_storage_error)?;
  let metadata = file.metadata().map_err(to_storage_error)?;
  if metadata.len() == 0 {
    return Ok(0);
  }

  let mmap = unsafe { MmapOptions::new().map(&file).map_err(to_storage_error)? };
  let mut cursor = 0usize;
  let mut max_seq: Option<u64> = None;

  while cursor + EVENT_HEADER_SIZE <= mmap.len() {
    let seq = read_u64(&mmap[cursor..cursor + 8]);
    cursor += 8;
    let len = read_u32(&mmap[cursor..cursor + 4]) as usize;
    cursor += 4;

    if cursor + len > mmap.len() {
      break;
    }

    max_seq = Some(max_seq.map_or(seq, |current| current.max(seq)));
    cursor += len;
  }

  Ok(max_seq.map(|seq| seq + 1).unwrap_or(0))
}

fn read_u64(bytes: &[u8]) -> u64 {
  let mut buffer = [0u8; 8];
  buffer.copy_from_slice(bytes);
  u64::from_le_bytes(buffer)
}

fn read_u32(bytes: &[u8]) -> u32 {
  let mut buffer = [0u8; 4];
  buffer.copy_from_slice(bytes);
  u32::from_le_bytes(buffer)
}

fn to_storage_error(error: std::io::Error) -> String {
  error.to_string()
}

fn to_napi_error(error: String) -> Error {
  Error::from_reason(error)
}

fn big_int_to_u64(value: &BigInt, label: &str) -> Result<u64> {
  let (sign, raw, lossless) = value.get_u64();
  if sign {
    return Err(Error::from_reason(format!("{label} must be unsigned")));
  }
  if !lossless {
    return Err(Error::from_reason(format!(
      "{label} exceeds JavaScript BigInt u64 range"
    )));
  }
  Ok(raw)
}

fn big_int_from_u64(value: u64) -> BigInt {
  BigInt {
    sign_bit: false,
    words: vec![value],
  }
}
