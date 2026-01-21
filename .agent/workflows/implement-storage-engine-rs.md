---
description: Implement Track AE - Rust Storage Engine
---

# Track AE: Rust Storage Engine Implementation

> Dependencies: Track AD (Sandbox Sidecar must be complete)
> Estimated Time: 4 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-ae-storage-engine.md`

---

## Prerequisites

Before starting, verify:
- [ ] Track AD completed and merged
- [ ] `packages/sandbox-rs` builds successfully
- [ ] Baseline benchmarks captured for current TS checkpoint

Run baseline benchmark:
// turbo
```bash
pnpm --filter=@ku0/agent-runtime test:benchmark -- --grep "checkpoint"
```

---

## Week 1: Storage API Design

### Step 1.1: Analyze Current Implementation
```bash
# Review current checkpoint storage
cat packages/agent-runtime/src/checkpoint/messagePackCheckpointStorage.ts

# Review TaskGraph event handling
cat packages/agent-runtime/src/tasks/taskGraph.ts
```

### Step 1.2: Initialize Rust Crate
// turbo
```bash
mkdir -p packages/storage-engine-rs
cd packages/storage-engine-rs
cargo init --lib
```

### Step 1.3: Define Storage Trait
Create `packages/storage-engine-rs/src/lib.rs`:
```rust
use std::io::Result;

/// Event for task graph telemetry
#[derive(Clone, Debug)]
pub struct Event {
    pub id: u64,
    pub timestamp: u64,
    pub event_type: String,
    pub payload: Vec<u8>,
}

/// Core storage engine trait
pub trait StorageEngine {
    /// Save a checkpoint snapshot
    fn save_checkpoint(&self, id: &str, data: &[u8]) -> Result<()>;
    
    /// Load a checkpoint by ID
    fn load_checkpoint(&self, id: &str) -> Result<Vec<u8>>;
    
    /// Append an event to the log
    fn append_event(&self, event: &Event) -> Result<u64>;
    
    /// Replay events from a given sequence number
    fn replay_events(&self, from: u64) -> Box<dyn Iterator<Item = Event>>;
    
    /// Prune old events before sequence number
    fn prune(&self, before: u64) -> Result<usize>;
}
```

### Step 1.4: Define TypeScript Interface
Create `packages/storage-engine-rs/npm/types.ts`:
```typescript
export interface Event {
  id: bigint;
  timestamp: number;
  eventType: string;
  payload: Buffer;
}

export interface StorageEngine {
  saveCheckpoint(id: string, data: Buffer): Promise<void>;
  loadCheckpoint(id: string): Promise<Buffer>;
  appendEvent(event: Omit<Event, 'id'>): Promise<bigint>;
  replayEvents(from: bigint): AsyncIterable<Event>;
  prune(before: bigint): Promise<number>;
}
```

---

## Week 2: Event Log Implementation

### Step 2.1: Add Dependencies
Update `packages/storage-engine-rs/Cargo.toml`:
```toml
[package]
name = "storage-engine-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
memmap2 = "0.9"
zstd = "0.13"
bincode = "1"
parking_lot = "0.12"
thiserror = "1"

[build-dependencies]
napi-build = "2"
```

### Step 2.2: Implement Append-Only Log
Create `packages/storage-engine-rs/src/event_log.rs`:
```rust
use memmap2::MmapOptions;
use std::fs::{File, OpenOptions};
use std::path::Path;

pub struct EventLog {
    file: File,
    mmap: Option<memmap2::Mmap>,
    write_offset: u64,
}

impl EventLog {
    pub fn open(path: &Path) -> Result<Self> {
        // 1. Open or create file
        // 2. Memory-map for reads
        // 3. Track write offset
    }
    
    pub fn append(&mut self, data: &[u8]) -> Result<u64> {
        // 1. Write length prefix
        // 2. Write data
        // 3. Fsync
        // 4. Return sequence number
    }
    
    pub fn read(&self, offset: u64) -> Result<Vec<u8>> {
        // 1. Read length from mmap
        // 2. Read data
    }
}
```

### Step 2.3: Add WAL and Checksums
Create `packages/storage-engine-rs/src/wal.rs`:
- Implement write-ahead log for crash recovery
- Add CRC32 checksums for integrity

### Step 2.4: Test Event Log
// turbo
```bash
cd packages/storage-engine-rs && cargo test event_log
```

---

## Week 3: Checkpoint Implementation

### Step 3.1: Implement Checkpoint Store
Create `packages/storage-engine-rs/src/checkpoint.rs`:
```rust
use zstd::stream::{Encoder, Decoder};

pub struct CheckpointStore {
    base_path: PathBuf,
}

impl CheckpointStore {
    pub fn save(&self, id: &str, data: &[u8]) -> Result<()> {
        // 1. Compress with Zstd
        // 2. Write to temp file
        // 3. Atomic rename
    }
    
    pub fn load(&self, id: &str) -> Result<Vec<u8>> {
        // 1. Read file
        // 2. Decompress
    }
}
```

### Step 3.2: Implement Delta Compression
Create `packages/storage-engine-rs/src/delta.rs`:
- Compute delta between checkpoints
- Store only differences

### Step 3.3: Add File Locking
Ensure cross-platform file locking:
```rust
#[cfg(unix)]
fn lock_file(file: &File) -> Result<()> {
    use std::os::unix::io::AsRawFd;
    // Use flock
}

#[cfg(windows)]
fn lock_file(file: &File) -> Result<()> {
    // Use LockFileEx
}
```

### Step 3.4: Test Checkpoint Store
// turbo
```bash
cd packages/storage-engine-rs && cargo test checkpoint
```

---

## Week 4: TypeScript Integration

### Step 4.1: Create N-API Bindings
Create `packages/storage-engine-rs/src/napi.rs`:
```rust
use napi_derive::napi;

#[napi]
pub struct NativeStorageEngine {
    inner: Arc<Mutex<StorageEngineImpl>>,
}

#[napi]
impl NativeStorageEngine {
    #[napi(constructor)]
    pub fn new(path: String) -> napi::Result<Self> { ... }
    
    #[napi]
    pub async fn save_checkpoint(&self, id: String, data: Buffer) -> napi::Result<()> { ... }
    
    #[napi]
    pub async fn load_checkpoint(&self, id: String) -> napi::Result<Buffer> { ... }
}
```

### Step 4.2: Create TypeScript Package
// turbo
```bash
mkdir -p packages/storage-engine-rs/npm
```

Create `packages/storage-engine-rs/npm/index.ts`:
```typescript
import { NativeStorageEngine } from './native';
import type { StorageEngine, Event } from './types';

export class RustStorageEngine implements StorageEngine {
  private native: NativeStorageEngine;
  
  constructor(path: string) {
    this.native = new NativeStorageEngine(path);
  }
  
  async saveCheckpoint(id: string, data: Buffer): Promise<void> {
    return this.native.saveCheckpoint(id, data);
  }
  
  // ... other methods
}
```

### Step 4.3: Replace messagePackCheckpointStorage
Update `packages/agent-runtime/src/checkpoint/index.ts`:
```typescript
import { RustStorageEngine } from '@ku0/storage-engine-rs';
import { MessagePackCheckpointStorage } from './messagePackCheckpointStorage';

export function createCheckpointStorage(config: StorageConfig): CheckpointStorage {
  if (config.engine === 'rust') {
    return new RustStorageEngine(config.path);
  }
  return new MessagePackCheckpointStorage(config);
}
```

### Step 4.4: Update TaskGraph
Update `packages/agent-runtime/src/tasks/taskGraph.ts`:
- Replace event logging with Rust engine
- Add migration for existing data

### Step 4.5: Build and Test
// turbo
```bash
cd packages/storage-engine-rs && npm run build
pnpm test --filter=@ku0/agent-runtime -- --grep "checkpoint\|taskGraph"
```

---

## Acceptance Verification

// turbo
```bash
# 1. Event log write latency
cd packages/storage-engine-rs && cargo bench event_log

# 2. Checkpoint save/load benchmark
cd packages/storage-engine-rs && cargo bench checkpoint

# 3. Replay 100k events
cd packages/storage-engine-rs && cargo test --release replay_100k

# 4. Windows file lock test (if on Windows)
cd packages/storage-engine-rs && cargo test file_lock

# 5. Integration test
pnpm test --filter=@ku0/agent-runtime -- --grep "storage"
```

Expected results:
- [ ] Event log write P99 < 5ms
- [ ] Checkpoint 50% faster than msgpack
- [ ] Replay 100k events < 500ms
- [ ] Memory usage reduced 40%
- [ ] Windows crash recovery works

---

## Data Migration

For existing users:
1. Detect existing msgpack checkpoints
2. Convert to new format on first load
3. Keep backup of old format for 7 days
4. Clean up after successful migration
