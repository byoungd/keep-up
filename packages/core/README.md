# LFCC Core Kernel

Core implementation of Local-First Collaboration Contract (LFCC) v0.9 RC.

## Overview

LFCC Core is a platform-agnostic, deterministic collaborative editing kernel that runs in Node.js and browser workers. All algorithms are pure functions: `f(state, op) -> state`.

## Install

```bash
pnpm add @ku0/core
```

## Quick Start

```typescript
import {
  // Canonicalization
  canonicalize,
  // Shadow Model
  createShadowDocument,
  addBlock,
  applyOp,
  // Annotations
  createAnnotation,
  transitionAnnotation,
  // AI Pipeline
  sanitizePayload,
  runDryRun,
} from '@ku0/core';

// 1. Create a document
let doc = createShadowDocument();
const { doc: newDoc, blockId } = addBlock(doc, {
  type: 'paragraph',
  attrs: {},
  text: 'Hello World',
  parent_id: null,
  children_ids: [],
}, doc.root_id);

// 2. Apply an operation
const { doc: editedDoc } = applyOp(newDoc, {
  code: 'OP_TEXT_EDIT',
  block_id: blockId,
  offset: 5,
  delete_count: 0,
  insert: ' LFCC',
});

// 3. Canonicalize output
const canonical = canonicalize(editedDoc);
```

## Module Layout

```
packages/core/src/kernel/
├── canonicalizer/   # Recursive canonicalizer v2
├── mapping/         # Block mapping and anchoring
├── annotations/     # Annotation state machine
├── ai/              # AI dry-run pipeline
├── policy/          # Policy manifest and negotiation
├── integrity/       # Integrity verification
├── shadow/          # Shadow model and history
├── devtools/        # Developer diagnostics
├── testing/         # Consistency testing framework
└── index.ts         # Unified exports
```

## Core Modules

### 1. Canonicalizer (Normalization)

Converts any document structure into a deterministic canonical tree.

```typescript
import { canonicalize, normalizeMarks } from '@ku0/core';

// Canonicalize a document
const canonTree = canonicalize(shadowDoc);

// Normalize marks (sort and merge)
const normalized = normalizeMarks([
  { type: 'italic' },
  { type: 'bold' },
]); // -> [{ type: 'bold' }, { type: 'italic' }]
```

### 2. Shadow Model

Maintains internal document state and supports CRDT operations.

```typescript
import {
  createShadowDocument,
  addBlock,
  applyOp,
  classifyOp,
} from '@ku0/core';

// Create an empty document
let doc = createShadowDocument();

// Add a block
const { doc: doc1, blockId } = addBlock(doc, {
  type: 'paragraph',
  attrs: {},
  text: 'Hello',
  parent_id: null,
  children_ids: [],
}, doc.root_id);

// Apply an operation
const { doc: doc2 } = applyOp(doc1, {
  code: 'OP_TEXT_EDIT',
  block_id: blockId,
  offset: 5,
  delete_count: 0,
  insert: ' World',
});

// Classify operation
const category = classifyOp({ code: 'OP_BLOCK_SPLIT', ... });
// -> 'structural'
```

**Supported operations:**
- `OP_TEXT_EDIT` - text edit
- `OP_BLOCK_SPLIT` - block split
- `OP_BLOCK_JOIN` - block join
- `OP_MARK_EDIT` - mark edit
- `OP_BLOCK_MOVE` - block move
- `OP_HISTORY_RESTORE` - history restore

### 3. Annotations

Full annotation lifecycle state machine.

```typescript
import {
  createAnnotation,
  transitionAnnotation,
  AnnotationState,
} from '@ku0/core';

// Create an annotation
const anno = createAnnotation(
  'anno-1',
  'user-1',
  ['span-1', 'span-2'],
  { comment: 'Nice!' }
);

// Transition state
const resolved = transitionAnnotation(anno, 'RESOLVE', 'user-2');
console.log(resolved.state); // 'resolved'

// States: draft -> active -> resolved/rejected -> archived
```

**State diagram:**
```
draft ──PUBLISH──> active ──RESOLVE──> resolved ──ARCHIVE──> archived
                     │                     │
                     └──REJECT──> rejected─┘
```

### 4. AI Dry-Run Pipeline

Safe AI content ingestion pipeline.

```typescript
import {
  sanitizePayload,
  runDryRun,
  createEnvelope,
  DEFAULT_SANITIZATION_POLICY,
} from '@ku0/core';

// 1. Create request envelope
const envelope = createEnvelope(
  'frontier-abc',
  '<p>AI generated content</p>',
  [{ span_id: 'span-1', if_match_context_hash: 'hash-xyz' }]
);

// 2. Sanitize payload (strip unsafe tags)
const sanitized = sanitizePayload(
  envelope.ops_xml,
  DEFAULT_SANITIZATION_POLICY
);

// 3. Dry-run validation
const result = runDryRun(envelope, currentDoc, policy);
if (result.success) {
  // Safe to apply
  applyOp(currentDoc, result.operations);
} else {
  console.error(result.rejection_reason);
}
```

**Security policy:**
- Allowlist tags: `p`, `strong`, `em`, `a`, `code`, `table`, etc.
- Denylist tags: `script`, `style`, `iframe`, `onclick`, etc.
- Auto-normalized into the LFCC Canonical Tree

### 5. Policy (Negotiation)

Multi-party policy negotiation and validation.

```typescript
import {
  validateManifest,
  negotiatePolicies,
  DEFAULT_POLICY_MANIFEST,
} from '@ku0/core';

// Validate a policy manifest
const validation = validateManifest(manifest);
if (!validation.valid) {
  console.error(validation.errors);
}

// Negotiate policies
const negotiated = negotiatePolicies([
  clientManifest,
  serverManifest,
  documentManifest,
]);
```

### 6. Integrity

Document integrity checks and checkpoints.

```typescript
import {
  computeBlockHash,
  createCheckpoint,
  verifyCheckpoint,
  runIntegrityScan,
} from '@ku0/core';

// Compute a block hash
const hash = computeBlockHash(block);

// Create a checkpoint
const checkpoint = createCheckpoint(doc, annotations);

// Verify a checkpoint
const valid = verifyCheckpoint(checkpoint, currentDoc);

// Integrity scan
const scanResult = runIntegrityScan(doc, annotations, policy);
```

### 7. Mapping and Anchors

Block mapping and anchor resolution system.

```typescript
import {
  createAnchor,
  resolveAnchor,
  expandNeighbors,
  MAPPING_AXIOMS,
} from '@ku0/core';

// Create an anchor
const anchor = createAnchor('block-1', 10, 'after');

// Resolve anchor position
const position = resolveAnchor(anchor, doc);

// Neighbor expansion (for context matching)
const neighbors = expandNeighbors('block-1', doc, 2);
```

### 8. DevTools

Debugging and diagnostic utilities.

```typescript
import {
  compareCanonTrees,
  generateFullScanReport,
  PerformanceTracker,
  createBugReportTemplate,
} from '@ku0/core';

// Compare two canonical trees
const diff = compareCanonTrees(tree1, tree2);
if (!diff.equal) {
  console.log('First diff at:', diff.first_diff_path);
}

// Performance tracking
const tracker = new PerformanceTracker();
tracker.recordScan(cpuTime);
console.log(tracker.getMetrics());

// Generate a full scan report
const report = generateFullScanReport(startTime, blocksCount, ...);
console.log(formatScanReport(report));
```

### 9. Testing

Consistency and fuzz testing framework.

```typescript
import {
  createTestHarness,
  DEFAULT_FUZZ_CONFIG,
  formatSECResult,
  runFuzzIteration,
  runSECAssertion,
  GOLDEN_FIXTURES,
  runGoldenFixtureTests,
} from '@ku0/core';

// SEC (strong eventual consistency) assertion
const result = runSECAssertion({
  ...DEFAULT_FUZZ_CONFIG,
  seed: 12345,
  iterations: 100,
  ops_per_iteration: 50,
  replicas: 3,
});

console.log(formatSECResult(result));

// Golden fixture regression tests
const fixtureResults = runGoldenFixtureTests(applyOps);
```

To run the core unit tests locally (no built-in 10s timeout):
```bash
pnpm -C packages/core test
```

If you wrap tests with a timeout in CI, prefer minute-level caps (unit tests can exceed 10s).

### 10. Sync Server (WebSocket)

The server must call `handleConnection()` (or use `attachToWebSocket()`) before receiving any messages, otherwise the handshake will be rejected.

```typescript
import { SyncServer, attachToWebSocket } from '@ku0/core/sync/server';

const server = new SyncServer(config, persistence);

// Pseudo-code: wire to your WS library
const { onMessage, onClose } = attachToWebSocket(server, ws, docId);
ws.on('message', (data) => onMessage(data.toString(), clientId));
ws.on('close', onClose);
```

See `docs/Sync_Integration_Guide.md` for full integration details and defaults.

## Type Exports

All types can be imported from the root entry:

```typescript
import type {
  // Canonicalization
  CanonNode,
  CanonBlock,
  CanonText,
  Mark,
  // Shadow Model
  ShadowDocument,
  ShadowBlock,
  TypedOp,
  // Annotations
  Annotation,
  AnnotationState,
  AnnotationTransition,
  // AI
  AIEnvelope,
  DryRunResult,
  SanitizationPolicy,
  // Policy
  PolicyManifest,
  NegotiationResult,
  // Integrity
  Checkpoint,
  IntegrityScanResult,
  // Testing
  FuzzConfig,
  SECAssertionResult,
  GoldenFixture,
} from '@ku0/core';
```

## Design Principles

1. **Pure functions** - core algorithms are `f(state, op) -> state`
2. **Determinism** - same input always produces the same output
3. **Platform agnostic** - runs in Node.js and browser workers
4. **Type safety** - full TypeScript types, no `any`
5. **Fail-closed** - any AI pipeline failure rejects the request

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific modules
pnpm test canonicalizer
pnpm test shadow
pnpm test ai
```

## Release Gate

Single command (recommended):

```bash
bash scripts/core-release-gate.sh
```

The gate runs:
- Core tests (3x) to detect flakes
- Stress scripts (rate limit / handshake)
- Pack validation (tarball must include `dist/` + `README.md` + types and must not include `__tests__`)

Expected runtime: usually < 60s depending on machine.

CI policy: PR runs core tests + pack validation; stress scripts run nightly or manually.

Note: `pnpm pack` does not support `--filter`, so use `pnpm -C packages/core pack`.

See `docs/Core_Release_Gate_Usage.md`.

## License

MIT
