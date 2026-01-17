/**
 * LFCC v0.9 RC - Kernel Module
 *
 * The "Iron Core" of the Local-First Collaboration Contract.
 * Platform-agnostic, deterministic logic for collaborative editing.
 *
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md
 */

// Sync Module (WebSocket + Policy Negotiation)
// Re-exported as namespace to avoid conflicts with kernel policy module
export * as sync from "../sync/index.js";
// AI Dry-Run Harness
export * from "./ai/index.js";

// Annotation State Machine
export * from "./annotations/index.js";
// Canonicalizer
export * from "./canonicalizer/index.js";
// DevTools
export * from "./devtools/index.js";

// Integrity Verification
export * from "./integrity/index.js";
// Block Mapping & Anchors
export * from "./mapping/index.js";

// Operation Ordering
export * from "./operationOrdering.js";
// Policy Manifest & Negotiation
export * from "./policy/index.js";
// Shadow Model & History
export * from "./shadow/index.js";
// Testing Utilities
export * from "./testing/index.js";
