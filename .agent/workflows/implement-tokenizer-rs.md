---
description: Implement Track AF - Rust Tokenizer and Compression
---

# Track AF: Rust Tokenizer and Compression Implementation

> Dependencies: None (can run in parallel with AD/AE)
> Estimated Time: 4 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-af-tokenizer-compression.md`

---

## Prerequisites

Before starting, verify:
- [ ] Rust toolchain installed
- [ ] N-API + WASM targets installed

// turbo
```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

---

## Week 1: Tokenizer Scaffold

### Step 1.1: Analyze Current Implementation
```bash
# Review current token counter
cat packages/agent-runtime/src/utils/tokenCounter.ts

# Review context compactor
cat packages/agent-runtime/src/context/ContextCompactor.ts

# Review message compression
cat packages/agent-runtime/src/orchestrator/messageCompression.ts
```

### Step 1.2: Initialize Rust Crate
// turbo
```bash
mkdir -p packages/tokenizer-rs
cd packages/tokenizer-rs
cargo init --lib
```

### Step 1.3: Add Dependencies
Update `packages/tokenizer-rs/Cargo.toml`:
```toml
[package]
name = "tokenizer-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
tiktoken-rs = "0.5"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
zstd = "0.13"
rayon = "1"

[build-dependencies]
napi-build = "2"

[features]
wasm = []
```

### Step 1.4: Implement Basic Token Counter
Create `packages/tokenizer-rs/src/tokenizer.rs`:
```rust
use tiktoken_rs::CoreBPE;
use std::sync::OnceLock;

static ENCODERS: OnceLock<HashMap<String, CoreBPE>> = OnceLock::new();

pub fn count_tokens(text: &str, model: &str) -> u32 {
    let encoder = get_encoder(model);
    encoder.encode_with_special_tokens(text).len() as u32
}

pub fn count_tokens_batch(texts: &[&str], model: &str) -> Vec<u32> {
    use rayon::prelude::*;
    
    let encoder = get_encoder(model);
    texts
        .par_iter()
        .map(|text| encoder.encode_with_special_tokens(text).len() as u32)
        .collect()
}

fn get_encoder(model: &str) -> &'static CoreBPE {
    // Map model name to tiktoken encoding
}
```

### Step 1.5: Build and Test
// turbo
```bash
cd packages/tokenizer-rs && cargo test
```

---

## Week 2: Batch Tokenization Optimization

### Step 2.1: Add JSON Token Estimation
Create `packages/tokenizer-rs/src/json_tokens.rs`:
```rust
use serde_json::Value;

pub fn estimate_json_tokens(value: &Value, model: &str) -> u32 {
    match value {
        Value::Null => 1,
        Value::Bool(_) => 1,
        Value::Number(_) => 1,
        Value::String(s) => count_tokens(s, model) + 2, // +2 for quotes
        Value::Array(arr) => {
            2 + arr.iter().map(|v| estimate_json_tokens(v, model)).sum::<u32>()
        }
        Value::Object(obj) => {
            2 + obj.iter()
                .map(|(k, v)| count_tokens(k, model) + estimate_json_tokens(v, model) + 1)
                .sum::<u32>()
        }
    }
}
```

### Step 2.2: Optimize Parallel Processing
Add thread pool configuration:
```rust
use rayon::ThreadPoolBuilder;

pub fn init_thread_pool(num_threads: usize) {
    ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build_global()
        .unwrap();
}
```

### Step 2.3: Add Benchmarks
Create `packages/tokenizer-rs/benches/tokenizer.rs`:
```rust
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_count_tokens(c: &mut Criterion) {
    let text = include_str!("../fixtures/large_text.txt");
    c.bench_function("count_tokens_10k", |b| {
        b.iter(|| count_tokens(text, "gpt-4"))
    });
}

criterion_group!(benches, bench_count_tokens);
criterion_main!(benches);
```

// turbo
```bash
cd packages/tokenizer-rs && cargo bench
```

---

## Week 3: Context Compressor

### Step 3.1: Define Message Types
Create `packages/tokenizer-rs/src/types.rs`:
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function: FunctionCall,
}

#[derive(Clone, Debug)]
pub struct CompressedContext {
    pub messages: Vec<Message>,
    pub total_tokens: u32,
    pub truncated_count: usize,
}
```

### Step 3.2: Implement Structured Truncation
Create `packages/tokenizer-rs/src/compressor.rs`:
```rust
pub fn compress_context(
    messages: &[Message],
    max_tokens: u32,
    preserve_last_n: usize,
    model: &str,
) -> CompressedContext {
    let mut result = Vec::new();
    let mut total_tokens = 0u32;
    let mut truncated = 0usize;
    
    // 1. Always preserve system message
    // 2. Always preserve last N messages
    // 3. Preserve messages with tool_calls
    // 4. Truncate from oldest user/assistant messages
    
    // Implementation details...
}
```

### Step 3.3: Add Zstd Compression
Create `packages/tokenizer-rs/src/compression.rs`:
```rust
use zstd::stream::{encode_all, decode_all};

pub fn compress_payload(data: &[u8]) -> Vec<u8> {
    encode_all(data, 3).unwrap()
}

pub fn decompress_payload(data: &[u8]) -> Vec<u8> {
    decode_all(data).unwrap()
}
```

### Step 3.4: Test Compressor
// turbo
```bash
cd packages/tokenizer-rs && cargo test compressor
```

---

## Week 4: TypeScript Integration

### Step 4.1: Create N-API Bindings
Create `packages/tokenizer-rs/src/napi.rs`:
```rust
use napi_derive::napi;

#[napi]
pub fn count_tokens(text: String, model: String) -> u32 {
    crate::tokenizer::count_tokens(&text, &model)
}

#[napi]
pub fn count_tokens_batch(texts: Vec<String>, model: String) -> Vec<u32> {
    let refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    crate::tokenizer::count_tokens_batch(&refs, &model)
}

#[napi(object)]
pub struct JsMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<JsToolCall>>,
}

#[napi]
pub fn compress_context(
    messages: Vec<JsMessage>,
    max_tokens: u32,
    preserve_last_n: u32,
    model: String,
) -> JsCompressedContext {
    // Convert and call Rust implementation
}
```

### Step 4.2: Create WASM Fallback
Create `packages/tokenizer-rs/src/wasm.rs`:
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn count_tokens_wasm(text: &str, model: &str) -> u32 {
    crate::tokenizer::count_tokens(text, model)
}
```

// turbo
```bash
cd packages/tokenizer-rs && wasm-pack build --target web --out-dir pkg
```

### Step 4.3: Create TypeScript Package
Create `packages/tokenizer-rs/npm/index.ts`:
```typescript
import { native, isNativeAvailable } from './native';
import { wasm } from './wasm';

const impl = isNativeAvailable() ? native : wasm;

export function countTokens(text: string, model: string): number {
  return impl.countTokens(text, model);
}

export function countTokensBatch(texts: string[], model: string): number[] {
  return impl.countTokensBatch(texts, model);
}

export interface Message {
  role: string;
  content: string;
  toolCalls?: ToolCall[];
}

export function compressContext(
  messages: Message[],
  maxTokens: number,
  preserveLastN: number,
  model: string
): CompressedContext {
  return impl.compressContext(messages, maxTokens, preserveLastN, model);
}
```

### Step 4.4: Replace TypeScript Implementations
Update `packages/agent-runtime/src/utils/tokenCounter.ts`:
```typescript
import { countTokens, countTokensBatch } from '@ku0/tokenizer-rs';

// Export directly from Rust implementation
export { countTokens, countTokensBatch };
```

Update `packages/agent-runtime/src/context/ContextCompactor.ts`:
```typescript
import { compressContext } from '@ku0/tokenizer-rs';

export class ContextCompactor {
  compact(messages: Message[], maxTokens: number): Message[] {
    const result = compressContext(messages, maxTokens, 5, this.model);
    return result.messages;
  }
}
```

### Step 4.5: Build and Test
// turbo
```bash
cd packages/tokenizer-rs && npm run build
pnpm test --filter=@ku0/agent-runtime -- --grep "token\|context"
```

---

## Acceptance Verification

// turbo
```bash
# 1. Token counting benchmark (target: <1ms per 10k tokens)
cd packages/tokenizer-rs && cargo bench

# 2. Context compression benchmark
cd packages/tokenizer-rs && cargo bench compressor

# 3. Accuracy test (match tiktoken exactly)
cd packages/tokenizer-rs && cargo test accuracy

# 4. Integration test
pnpm test --filter=@ku0/agent-runtime -- --grep "token"
```

Expected results:
- [ ] Token counting < 1ms per 10k tokens
- [ ] Context compression 5x faster
- [ ] Token counts match tiktoken exactly
- [ ] Memory usage reduced 30%

---

## WASM Fallback Verification

Test WASM in browser context:
1. Create test HTML page
2. Load WASM module
3. Run token counting
4. Verify results match native
