# LFCC Conformance Kit

QA Conformance Kit for verifying LFCC v0.9 RC determinism and "no drift" invariants.

## Overview

This kit continuously verifies that:
- Loro replicated state and LFCC Shadow Model produce identical canonical trees
- Operations are deterministic: same seed → same ops → same outcomes
- Failures are reproducible with actionable artifacts

## Quick Start

```bash
# Run conformance tests (50 seeds × 200 steps)
pnpm conformance:run --seeds 50 --steps 200

# Run with verbose output
pnpm conformance:run --seeds 10 --steps 100 --verbose

# Replay a failed run
pnpm conformance:replay artifacts/<runId>/ops.shrunk.json

# Run package tests (vitest)
pnpm -C packages/conformance-kit test

# Run tests single-threaded (CI/low resource)
pnpm -C packages/conformance-kit test -- --maxThreads=1
```

## Architecture

```
conformance-kit/
├── adapters/        # Pluggable interfaces for Loro, Shadow, Canonicalizer
├── op-fuzzer/       # Operation generator + shrinker
├── double-blind/    # Harness comparing Loro vs Shadow
├── artifacts/       # Failure serialization + diff reporting
├── runner/          # Test orchestration
└── cli/             # Command-line tools
```

## Adapter Interfaces

The kit uses pluggable adapters to support both real implementations and mocks:

```typescript
import type { LoroAdapter, ShadowAdapter, CanonicalizerAdapter } from '@keepup/conformance-kit';

// Implement these interfaces for your real Loro/Shadow bridge
interface LoroAdapter {
  loadSnapshot(bytes: Uint8Array): void;
  exportSnapshot(): Uint8Array;
  applyOp(op: FuzzOp): ApplyResult;
  getFrontierTag(): string;
  getBlockIds(): string[];
  getBlock(blockId: string): BlockInfo | null;
  getTextLength(blockId: string): number;
}
```

## FuzzOp Types

Operations aligned with LFCC op taxonomy:

```typescript
type FuzzOp =
  | InsertText      // Insert text at offset
  | DeleteText      // Delete text range
  | AddMark         // Add mark to range
  | RemoveMark      // Remove mark from range
  | SplitBlock      // Split block (Enter key)
  | JoinWithPrev    // Join with previous (Backspace)
  | ReorderBlock    // Move block to new position
  | WrapInList      // Wrap blocks in list
  | UnwrapListItem  // Unwrap list item
  | TableInsertRow  // Insert table row
  | TableInsertColumn
  | TableDeleteRow
  | TableDeleteColumn
  | Paste           // Paste canonical fragment
  | Undo
  | Redo;
```

## Generator

Seeded generator for valid random operation programs:

```typescript
import { generateProgram, DEFAULT_GEN_CONFIG } from '@keepup/conformance-kit';

// Generate deterministic program
const ops = generateProgram(seed, steps, config, adapter);

// Same seed always produces same ops
const ops1 = generateProgram(42, 100, config, adapter1);
const ops2 = generateProgram(42, 100, config, adapter2);
// ops1 === ops2 ✓
```

### Stress Modes

```typescript
const config = {
  ...DEFAULT_GEN_CONFIG,
  stressMode: 'typingBurst',    // Many small text inserts
  // or: 'structureStorm'       // Many splits/reorders/table ops
  // or: 'markChaos'            // Overlapping marks
  // or: 'balanced'             // Default mix
};
```

## Shrinker

Minimizes failing programs to minimal repro:

```typescript
import { shrinkProgram } from '@keepup/conformance-kit';

const result = await shrinkProgram(failingOps, predicateFails);
// result.shrunkOps is minimal sequence that still fails
```

## Double-Blind Harness

Runs same program against Loro and Shadow, compares canonical output:

```typescript
import { DoubleBlindHarness } from '@keepup/conformance-kit';

const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
  checkpointPolicy: 'everyN',
  checkpointInterval: 10,
});

const result = await harness.run(seed, ops);
if (!result.passed) {
  console.log('Mismatch at step:', result.firstMismatch.stepIndex);
}
```

### Checkpoint Policies

- `everyStep` - Compare after every operation (slowest, most thorough)
- `everyN` - Compare every N steps (default for CI)
- `structureOnly` - Compare only after structural ops

## Artifacts

On failure, the kit saves actionable artifacts:

```
artifacts/<runId>/
├── seed.json              # Seed and timestamp
├── config.json            # Generator configuration
├── initial_snapshot.loro.bin
├── ops.original.json      # Full operation sequence
├── ops.shrunk.json        # Minimized failing sequence
├── fail_step.txt          # Failure details
├── canon.loro.json        # Loro canonical tree
├── canon.shadow.json      # Shadow canonical tree
├── canon.diff.txt         # Readable diff
├── frontiers.log.jsonl    # Frontier log
└── notes.md               # Human-readable report
```

## CI Integration

### Fast Gate (PR blocking)

```bash
pnpm conformance:run --ci-fast
# 50 seeds × 200 steps, checkpoint every 10 ops
# Target: < 5 minutes
```

### Nightly Stress (non-blocking)

```bash
pnpm conformance:run --ci-nightly
# 500 seeds × 2000 steps, checkpoint every op
# Includes large paste cases and structure storm
```

### GitHub Actions Example

```yaml
jobs:
  conformance-fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm conformance:run --ci-fast
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: conformance-artifacts
          path: artifacts/

  conformance-nightly:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm conformance:run --ci-nightly --artifacts ./nightly-artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: nightly-artifacts
          path: nightly-artifacts/
```

## CLI Reference

```bash
pnpm conformance:run [options]

Options:
  --seeds <n>              Number of seeds (default: 50)
  --steps <n>              Steps per seed (default: 200)
  --start-seed <n>         Starting seed (default: 1)
  --checkpoint-every <n>   Checkpoint interval (default: 10)
  --checkpoint-all         Checkpoint every step
  --checkpoint-structure   Checkpoint only after structural ops
  --stress                 Enable structure storm mode
  --stress-mode <mode>     typingBurst | structureStorm | markChaos | balanced
  --artifacts <dir>        Output directory (default: ./artifacts)
  --stop-on-failure        Stop on first failure
  --max-failures <n>       Max failures to collect (default: 10)
  --verbose, -v            Verbose output
  --no-shrink              Disable program shrinking
  --ci-fast                CI fast gate config
  --ci-nightly             CI nightly stress config
```

## Extending

### Custom Adapters

```typescript
import { AdapterFactory, LoroAdapter } from '@keepup/conformance-kit';

class MyLoroAdapter implements LoroAdapter {
  // Implement interface methods
}

class MyAdapterFactory implements AdapterFactory {
  createLoroAdapter() { return new MyLoroAdapter(); }
  createShadowAdapter() { return new MyShadowAdapter(); }
  createCanonicalizerAdapter() { return new MyCanonicalizerAdapter(); }
}

// Use with runner
const runner = new ConformanceRunner(new MyAdapterFactory(), config);
```

### Custom Operations

Extend `FuzzOp` type and update generator for domain-specific operations.

## Design Principles

1. **Semantic equality** - Compare canonical trees, not HTML
2. **Deterministic** - Same seed → same ops → same outcomes
3. **Actionable failures** - Seed + snapshot + minimal op sequence + diff
4. **Pluggable** - Works with mocks or real implementations
5. **CI-ready** - Fast gate + nightly stress configurations

## License

MIT
