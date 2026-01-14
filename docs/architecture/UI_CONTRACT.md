# Collaborative Document UI Contract

> **Status**: Frozen (v1.0)
> **Last Updated**: 2026-01-13
> **Scope**: UI ↔ LFCC Bridge architectural boundary

## Overview

This document defines the **frozen contract** between UI components and the LFCC (Local-First Collaboration Contract) storage layer. The contract establishes a clear separation of concerns where:

- **UI Layer** depends ONLY on ProseMirror schema and Bridge API
- **UI Layer** NEVER directly accesses Loro storage internals

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                             │
│  (React, ProseMirror NodeViews, Annotations, AI Panel, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ALLOWED: PM Schema, Bridge API, Facade
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Bridge Layer (Contract)                      │
│  • BridgeController    • DocumentFacade    • EditorAdapterPM    │
│  • Selection Mapping   • AI Gateway        • Sync Adapters      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ INTERNAL: Loro CRDT operations
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Loro Storage Layer                          │
│  • LoroDoc    • LoroMap    • LoroList    • LoroText             │
└─────────────────────────────────────────────────────────────────┘
```

## Allowed Dependencies (UI → Bridge)

### 1. ProseMirror Schema (`pmSchema`)

UI components MAY depend on:

```typescript
import { pmSchema } from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Schema-based operations
const paragraph = pmSchema.nodes.paragraph;
const bold = pmSchema.marks.bold;
```

### 2. Bridge Controller API

```typescript
import { BridgeController, type DivergenceResult } from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Bridge lifecycle
bridge.setView(view);
bridge.syncFromLoro();
bridge.destroy();

// ✅ ALLOWED: AI Gateway integration
bridge.applyAIGatewayPlan(options);
bridge.validateAIPayload(payload);

// ✅ ALLOWED: Divergence callbacks
onDivergence?: (result: DivergenceResult) => void;
```

### 3. Document Facade API (Preferred for Non-Editor UI)

```typescript
import { createDocumentFacade, type DocumentFacade } from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Read operations
facade.getBlocks();
facade.getBlock(blockId);
facade.getBlockText(blockId);
facade.getAnnotations();
facade.getMessages();

// ✅ ALLOWED: Intent-based mutations
facade.insertBlock(intent);
facade.updateBlockContent(intent);
facade.applyAIPlan(plan, metadata);

// ✅ ALLOWED: Subscriptions
facade.subscribe((event) => { ... });
```

### 4. Selection Mapping Utilities

```typescript
import {
  pmSelectionToSpanList,
  spanListToPmRanges,
  type SpanList,
} from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Selection ↔ SpanList conversion
const spanList = pmSelectionToSpanList(selection, state, runtime);
const ranges = spanListToPmRanges(spanList, runtime, state);
```

### 5. Type Imports

```typescript
import type {
  LoroRuntime,
  SpanList,
  SpanChainPolicy,
  BlockNode,
  RichText,
} from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Type-only imports for function signatures
```

### 6. Constants and Metadata Keys

```typescript
import {
  BRIDGE_ORIGIN_META,
  AI_INTENT_META,
} from "@ku0/lfcc-bridge";

// ✅ ALLOWED: Transaction metadata keys
tr.getMeta(BRIDGE_ORIGIN_META);
tr.setMeta(AI_INTENT_META, true);
```

## Forbidden Dependencies (UI ✗ Loro)

### 1. Direct Loro Container Access

```typescript
// ❌ FORBIDDEN: Direct LoroDoc operations
import { LoroDoc } from "loro-crdt";
runtime.doc.getMap("blocks");
runtime.doc.getList("root");

// ❌ FORBIDDEN: Direct container manipulation
loroMap.set("key", value);
loroList.insert(0, item);
loroText.insert(0, "text");
```

### 2. Loro Internal Schema Access

```typescript
// ❌ FORBIDDEN: Direct CRDT schema functions
import { ensureBlockMap, updateBlockText } from "@ku0/lfcc-bridge/crdt";

// ❌ FORBIDDEN: Reading block tree directly
import { readBlockTree, getRootBlocks } from "@ku0/lfcc-bridge";
// Exception: VirtualizedDocView (legacy, to be migrated to Facade)
```

### 3. Loro Event Subscriptions

```typescript
// ❌ FORBIDDEN: Direct Loro subscriptions in UI
runtime.doc.subscribe((event) => {
  // UI should NOT handle raw Loro events
});

// ✅ CORRECT: Use Bridge or Facade subscriptions instead
bridge.onStateChange = (state) => { ... };
facade.subscribe((event) => { ... });
```

### 4. Loro Peer/Version Operations

```typescript
// ❌ FORBIDDEN: Peer ID manipulation
runtime.doc.setPeerId(peerId);
runtime.doc.peerIdStr;

// ❌ FORBIDDEN: Version/frontier access
runtime.doc.frontiers();
runtime.doc.version();
```

## Facade vs Bridge: When to Use Each

| Use Case | Recommended API |
|----------|-----------------|
| ProseMirror editor integration | `BridgeController` |
| Non-editor UI (sidebars, panels) | `DocumentFacade` |
| AI chat/messages | `DocumentFacade` |
| Annotations list | `DocumentFacade` |
| Selection-to-span conversion | Bridge utilities |
| Read-only document views | `DocumentFacade` |

## Contract Enforcement

### 1. CI Script Check (Primary)

The project uses a CI script (run via `pnpm ui:contract`) to detect UI contract violations. The script is authoritative for scope and exceptions:

```bash
# scripts/check-ui-contract.sh (excerpt)
UI_ROOTS=(
  "apps/reader/src/components"
  "apps/reader/app"
)

EXCEPTION_FILES=(
  "apps/reader/src/components/lfcc/useLfccBridge.ts"
)

report_violations "Direct loro-crdt imports found" "from ['\"]loro-crdt['\"]"
report_violations "Internal CRDT imports found" "from ['\"]@ku0/lfcc-bridge/crdt"
report_violations "Direct CRDT tree reads found" "readBlockTree\\s*\\(|getRootBlocks\\s*\\("
report_violations "Direct Loro runtime access found" \
  "runtime\\.doc\\.(getMap|getList|getText|subscribe|frontiers|version|setPeerId|peerIdStr)"
```

Notes:
- Scope excludes `apps/reader/app/api` (server-only routes).
- Exceptions are tracked in the Known Exceptions table below.
- CI runs `pnpm ui:contract` in the lint job.

### 2. TypeScript Path Restrictions

Configure `tsconfig.json` to guide developers:

```json
{
  "compilerOptions": {
    "paths": {
      // Preferred imports
      "@ku0/lfcc-bridge": ["./packages/lfcc-bridge/src/index.ts"],
      "@ku0/lfcc-bridge/facade": ["./packages/lfcc-bridge/src/facade/index.ts"]
      // Note: Internal paths like @ku0/lfcc-bridge/crdt/* are NOT exposed
    }
  }
}
```

This is configured in `apps/reader/tsconfig.json` for the UI package.

### 3. Runtime Strict Mode (Development)

Enable strict mode to detect violations at runtime:

```typescript
// Environment variable
LFCC_UNSAFE_DIRECT_ACCESS=false  // Default: enforce contract

// In DocumentFacade
export const FACADE_STRICT_MODE =
  process.env.LFCC_UNSAFE_DIRECT_ACCESS !== "true";
```

### 4. Code Review Checklist

During PR review, check:

- [ ] No `import ... from "loro-crdt"` in UI scope (`apps/reader/src/components`, `apps/reader/app`)
- [ ] No `runtime.doc.getMap()` or `runtime.doc.getList()` calls
- [ ] No direct `LoroMap`, `LoroList`, `LoroText` usage
- [ ] No `readBlockTree()` or `getRootBlocks()` usage in UI code
- [ ] No `runtime.doc.subscribe/frontiers/version/peerIdStr` access in UI code
- [ ] New UI components use `DocumentFacade` or `BridgeController`

## Migration Path for Existing Violations

### Completed Migrations

| File | Former Violation | Migration Applied |
|------|------------------|-------------------|
| `VirtualizedDocView.tsx` | `readBlockTree(runtime.doc)` | `createDocumentFacade(runtime).getBlocks()` |
| `VirtualizedDocView.tsx` | `runtime.doc.subscribe()` | `facade.subscribe()` |
| `AIContextMenu.tsx` | `runtime.doc.peerIdStr` | `runtime.peerId` accessor |
| `LfccDebugOverlay.tsx` | `runtime.doc.peerIdStr` | `runtime.peerId` accessor |

### Migration Example

```typescript
// BEFORE (violation)
import { readBlockTree } from "@ku0/lfcc-bridge";
const blocks = readBlockTree(runtime.doc);
runtime.doc.subscribe(updateRows);

// AFTER (compliant)
import { createDocumentFacade } from "@ku0/lfcc-bridge";
const facade = createDocumentFacade(runtime);
const blocks = facade.getBlocks();
const unsubscribe = facade.subscribe(() => setBlocks(facade.getBlocks()));
```

## Exception Process

If a UI component genuinely needs direct Loro access (e.g., for debugging or benchmarking):

1. Document the exception in the component with `// LFCC-CONTRACT-EXCEPTION:`
2. Set `LFCC_UNSAFE_DIRECT_ACCESS=true` for that context
3. Add to the Known Exceptions table in this document
4. Create a migration plan to remove the exception

### Known Exceptions

| Component | Reason | Planned Migration |
|-----------|--------|-------------------|
| `useLfccBridge` | Bootstrap/initialization | N/A (bridge layer) |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2026-01-13 | Migrated VirtualizedDocView, AIContextMenu, LfccDebugOverlay to contract-compliant APIs; added `runtime.peerId` accessor; reduced exceptions from 4 to 1 |
| 1.0 | 2025-01-12 | Initial frozen contract |

---

**Maintainers**: Core Team
**Review Required For**: Any changes to allowed/forbidden lists
