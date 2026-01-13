/**
 * LFCC v0.9 RC - Kernel Module
 *
 * The "Iron Core" of the Local-First Collaboration Contract.
 * Platform-agnostic, deterministic logic for collaborative editing.
 *
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md
 */

// Canonicalizer
export * from "./canonicalizer/index.js";

// Block Mapping & Anchors
export * from "./mapping/index.js";

// Annotation State Machine
export * from "./annotations/index.js";

// AI Dry-Run Harness
export * from "./ai/index.js";

// Policy Manifest & Negotiation
export * from "./policy/index.js";

// Integrity Verification
export * from "./integrity/index.js";

// Shadow Model & History
export * from "./shadow/index.js";

// Operation Ordering
export * from "./operationOrdering.js";

// DevTools
export * from "./devtools/index.js";

// Testing Utilities
export * from "./testing/index.js";

// Sync Module (WebSocket + Policy Negotiation)
// Re-exported as namespace to avoid conflicts with kernel policy module
export * as sync from "../sync/index.js";
