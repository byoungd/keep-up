/**
 * LFCC v0.9 RC - Kernel Module
 *
 * The "Iron Core" of the Local-First Collaboration Contract.
 * Platform-agnostic, deterministic logic for collaborative editing.
 *
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md
 */

// Canonicalizer
export * from "./canonicalizer";

// Block Mapping & Anchors
export * from "./mapping";

// Annotation State Machine
export * from "./annotations";

// AI Dry-Run Harness
export * from "./ai";

// Policy Manifest & Negotiation
export * from "./policy";

// Integrity Verification
export * from "./integrity";

// Shadow Model & History
export * from "./shadow";

// Operation Ordering
export * from "./operationOrdering";

// DevTools
export * from "./devtools";

// Testing Utilities
export * from "./testing";

// Sync Module (WebSocket + Policy Negotiation)
// Re-exported as namespace to avoid conflicts with kernel policy module
export * as sync from "../sync";
