/**
 * Browser Module
 *
 * Playwright-backed browser automation helpers for agent tools.
 */

export {
  type AccessibilityNodeRef,
  type AccessibilityNodeSnapshot,
  type AccessibilitySnapshot,
  buildAccessibilitySnapshot,
  parseAccessibilitySnapshotText,
  type RawAccessibilityNode,
} from "./accessibilityMapper";
export {
  type BrowserCloseResult,
  BrowserManager,
  type BrowserManagerOptions,
  type BrowserSession,
  type BrowserSessionConfig,
} from "./browserManager";
