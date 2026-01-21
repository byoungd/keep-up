---
description: Implement Track AG - Rust LSP Indexer
---

# Track AG: Rust LSP Symbol Indexer Implementation

> Dependencies: Tracks AD-AF should be stable before starting
> Estimated Time: 6 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-ag-lsp-indexer.md`

---

## Prerequisites

Before starting, verify:
- [ ] Tracks AD, AE, AF are merged and stable
- [ ] Baseline benchmarks for current symbol query latency

// turbo
```bash
# Capture baseline
pnpm --filter=@ku0/agent-runtime test:benchmark -- --grep "symbol"
```

---

## Week 1: Index Design

### Step 1.1: Analyze Current Implementation
```bash
# Review current symbol graph
cat packages/agent-runtime/src/lsp/symbolGraph.ts

# Review import graph
cat packages/agent-runtime/src/lsp/importGraph.ts

# Review tool output spooler
cat packages/agent-runtime/src/spooling/toolOutputSpooler.ts
```

### Step 1.2: Research Index Libraries
Evaluate options:
- `tantivy` - Full-text search engine (https://github.com/quickwit-oss/tantivy)
- `fst` - Finite state transducers (https://github.com/BurntSushi/fst)
- Custom inverted index

### Step 1.3: Initialize Rust Crate
// turbo
```bash
mkdir -p packages/symbol-index-rs
cd packages/symbol-index-rs
cargo init --lib
```

### Step 1.4: Define Index Schema
Create `packages/symbol-index-rs/src/schema.rs`:
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub container: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Variable,
    Constant,
    Module,
    Type,
    Enum,
    Property,
    Method,
}

#[derive(Clone, Debug)]
pub struct QueryOptions {
    pub kind_filter: Option<Vec<SymbolKind>>,
    pub path_prefix: Option<String>,
    pub limit: usize,
    pub fuzzy: bool,
}

#[derive(Clone, Debug)]
pub struct SymbolResult {
    pub symbol: Symbol,
    pub score: f32,
}
```

---

## Week 2: Inverted Index

### Step 2.1: Add Dependencies
Update `packages/symbol-index-rs/Cargo.toml`:
```toml
[package]
name = "symbol-index-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
fst = "0.4"
parking_lot = "0.12"
serde = { version = "1", features = ["derive"] }
bincode = "1"
memmap2 = "0.9"

[build-dependencies]
napi-build = "2"
```

### Step 2.2: Implement Inverted Index
Create `packages/symbol-index-rs/src/inverted.rs`:
```rust
use fst::{Set, SetBuilder};
use std::collections::HashMap;

pub struct InvertedIndex {
    /// Term -> Document IDs
    postings: HashMap<String, Vec<u32>>,
    /// Document ID -> Symbol
    documents: Vec<Symbol>,
    /// Path -> Document IDs
    path_index: HashMap<String, Vec<u32>>,
}

impl InvertedIndex {
    pub fn new() -> Self { ... }
    
    pub fn add_document(&mut self, symbol: Symbol) -> u32 {
        let doc_id = self.documents.len() as u32;
        
        // Index symbol name terms
        for term in tokenize(&symbol.name) {
            self.postings.entry(term).or_default().push(doc_id);
        }
        
        // Index by path
        self.path_index.entry(symbol.path.clone())
            .or_default()
            .push(doc_id);
        
        self.documents.push(symbol);
        doc_id
    }
    
    pub fn search(&self, query: &str, opts: &QueryOptions) -> Vec<SymbolResult> {
        // 1. Tokenize query
        // 2. Look up postings
        // 3. Intersect results
        // 4. Score and rank
        // 5. Apply filters
        // 6. Limit results
    }
}
```

### Step 2.3: Test Inverted Index
// turbo
```bash
cd packages/symbol-index-rs && cargo test inverted
```

---

## Week 3: Fuzzy Search (Trigram Index)

### Step 3.1: Implement Trigram Index
Create `packages/symbol-index-rs/src/trigram.rs`:
```rust
pub struct TrigramIndex {
    /// Trigram -> Document IDs
    index: HashMap<[u8; 3], Vec<u32>>,
}

impl TrigramIndex {
    pub fn new() -> Self { ... }
    
    pub fn add(&mut self, text: &str, doc_id: u32) {
        for trigram in generate_trigrams(text) {
            self.index.entry(trigram).or_default().push(doc_id);
        }
    }
    
    pub fn search(&self, query: &str, threshold: f32) -> Vec<(u32, f32)> {
        let query_trigrams: HashSet<_> = generate_trigrams(query).collect();
        
        // Count matching trigrams per document
        let mut scores: HashMap<u32, usize> = HashMap::new();
        for trigram in &query_trigrams {
            if let Some(docs) = self.index.get(trigram) {
                for &doc_id in docs {
                    *scores.entry(doc_id).or_default() += 1;
                }
            }
        }
        
        // Calculate Jaccard similarity
        scores.into_iter()
            .map(|(doc_id, matches)| {
                let similarity = matches as f32 / query_trigrams.len() as f32;
                (doc_id, similarity)
            })
            .filter(|(_, score)| *score >= threshold)
            .collect()
    }
}

fn generate_trigrams(text: &str) -> impl Iterator<Item = [u8; 3]> + '_ {
    let padded = format!("  {}  ", text.to_lowercase());
    padded.as_bytes()
        .windows(3)
        .map(|w| [w[0], w[1], w[2]])
}
```

### Step 3.2: Combine Indexes
Create `packages/symbol-index-rs/src/lib.rs`:
```rust
pub struct SymbolIndex {
    inverted: InvertedIndex,
    trigram: TrigramIndex,
}

impl SymbolIndex {
    pub fn update_file(&mut self, path: &str, symbols: &[Symbol]) {
        // 1. Remove old entries for path
        // 2. Add new symbols to both indexes
    }
    
    pub fn remove_file(&mut self, path: &str) {
        // Remove from both indexes
    }
    
    pub fn query(&self, query: &str, opts: QueryOptions) -> Vec<SymbolResult> {
        if opts.fuzzy {
            // Use trigram index
            let candidates = self.trigram.search(query, 0.3);
            // Re-rank with inverted index scoring
        } else {
            // Use inverted index directly
            self.inverted.search(query, &opts)
        }
    }
    
    pub fn stats(&self) -> IndexStats {
        IndexStats {
            total_symbols: self.inverted.documents.len(),
            total_files: self.inverted.path_index.len(),
            memory_usage: self.estimate_memory(),
        }
    }
}
```

### Step 3.3: Test Fuzzy Search
// turbo
```bash
cd packages/symbol-index-rs && cargo test fuzzy
```

---

## Week 4: TypeScript Integration

### Step 4.1: Create N-API Bindings
Create `packages/symbol-index-rs/src/napi.rs`:
```rust
use napi_derive::napi;

#[napi]
pub struct NativeSymbolIndex {
    inner: parking_lot::RwLock<SymbolIndex>,
}

#[napi]
impl NativeSymbolIndex {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: parking_lot::RwLock::new(SymbolIndex::new()),
        }
    }
    
    #[napi]
    pub fn update_file(&self, path: String, symbols: Vec<JsSymbol>) {
        let symbols: Vec<Symbol> = symbols.into_iter().map(Into::into).collect();
        self.inner.write().update_file(&path, &symbols);
    }
    
    #[napi]
    pub fn remove_file(&self, path: String) {
        self.inner.write().remove_file(&path);
    }
    
    #[napi]
    pub fn query(&self, query: String, opts: JsQueryOptions) -> Vec<JsSymbolResult> {
        self.inner.read()
            .query(&query, opts.into())
            .into_iter()
            .map(Into::into)
            .collect()
    }
}
```

### Step 4.2: Create TypeScript Package
Create `packages/symbol-index-rs/npm/index.ts`:
```typescript
import { NativeSymbolIndex, JsSymbol, JsQueryOptions } from './native';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  path: string;
  startLine: number;
  endLine: number;
  container?: string;
}

export class SymbolIndex {
  private native: NativeSymbolIndex;
  
  constructor() {
    this.native = new NativeSymbolIndex();
  }
  
  updateFile(path: string, symbols: Symbol[]): void {
    this.native.updateFile(path, symbols);
  }
  
  removeFile(path: string): void {
    this.native.removeFile(path);
  }
  
  query(query: string, options?: QueryOptions): SymbolResult[] {
    return this.native.query(query, options ?? {});
  }
}
```

### Step 4.3: Replace symbolGraph.ts
Update `packages/agent-runtime/src/lsp/symbolGraph.ts`:
```typescript
import { SymbolIndex as RustSymbolIndex } from '@ku0/symbol-index-rs';

export class SymbolGraph {
  private index: RustSymbolIndex;
  
  constructor() {
    this.index = new RustSymbolIndex();
  }
  
  // Delegate to Rust implementation
}
```

### Step 4.4: Build and Test
// turbo
```bash
cd packages/symbol-index-rs && npm run build
pnpm test --filter=@ku0/agent-runtime -- --grep "symbol\|lsp"
```

---

## Week 5: Tool Output Streaming (Optional)

### Step 5.1: Implement Stream Writer
Create `packages/symbol-index-rs/src/streaming.rs`:
```rust
pub struct OutputStreamer {
    base_path: PathBuf,
    max_memory: usize,
}

impl OutputStreamer {
    pub fn new(base_path: PathBuf, max_memory: usize) -> Self { ... }
    
    pub fn write(&mut self, output: &[u8]) -> StreamHandle {
        if output.len() > self.max_memory {
            // Write to disk, return file handle
            self.write_to_disk(output)
        } else {
            // Keep in memory
            StreamHandle::Memory(output.to_vec())
        }
    }
    
    pub fn read(&self, handle: &StreamHandle) -> Vec<u8> {
        match handle {
            StreamHandle::Memory(data) => data.clone(),
            StreamHandle::File(path) => std::fs::read(path).unwrap(),
        }
    }
    
    pub fn truncate(&self, handle: &StreamHandle, max_size: usize) -> Vec<u8> {
        // Read and truncate with chunk boundaries
    }
}
```

### Step 5.2: Integrate with Tool Output Spooler
Update `packages/agent-runtime/src/spooling/toolOutputSpooler.ts`:
```typescript
import { OutputStreamer } from '@ku0/symbol-index-rs';

export class ToolOutputSpooler {
  private streamer: OutputStreamer;
  
  async spool(output: string): Promise<StreamHandle> {
    return this.streamer.write(Buffer.from(output));
  }
}
```

---

## Week 6: Performance Tuning

### Step 6.1: Add Benchmarks
Create `packages/symbol-index-rs/benches/query.rs`:
```rust
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_query_100k(c: &mut Criterion) {
    let index = create_index_with_100k_symbols();
    
    c.bench_function("query_exact", |b| {
        b.iter(|| index.query("MyFunction", QueryOptions::default()))
    });
    
    c.bench_function("query_fuzzy", |b| {
        b.iter(|| index.query("MyFnc", QueryOptions { fuzzy: true, ..Default::default() }))
    });
}

criterion_group!(benches, bench_query_100k);
criterion_main!(benches);
```

### Step 6.2: Profile and Optimize
// turbo
```bash
cd packages/symbol-index-rs && cargo bench

# Profile with flamegraph
cargo install flamegraph
cd packages/symbol-index-rs && cargo flamegraph --bench query
```

### Step 6.3: Index Persistence
Add save/load for persistent index:
```rust
impl SymbolIndex {
    pub fn save(&self, path: &Path) -> Result<()> {
        // Serialize to disk
    }
    
    pub fn load(path: &Path) -> Result<Self> {
        // Deserialize from disk
    }
}
```

---

## Acceptance Verification

// turbo
```bash
# 1. Query latency (target: <5ms for 100k symbols)
cd packages/symbol-index-rs && cargo bench

# 2. Incremental update (target: <10ms per file)
cd packages/symbol-index-rs && cargo test incremental_update

# 3. Memory usage test
cd packages/symbol-index-rs && cargo test --release memory_usage

# 4. Fuzzy search quality
cd packages/symbol-index-rs && cargo test fuzzy_quality

# 5. Integration test
pnpm test --filter=@ku0/agent-runtime -- --grep "symbol"
```

Expected results:
- [ ] Symbol query < 5ms for 100k symbols
- [ ] Incremental update < 10ms per file
- [ ] Memory usage 50% lower than JS map
- [ ] Fuzzy search quality matches current

---

## Rollback Plan

If issues arise:
1. Revert changes to `packages/agent-runtime/src/lsp/symbolGraph.ts`
2. Set config flag to use JS implementation
3. Remove `@ku0/symbol-index-rs` dependency
