/**
 * Feature Flags
 *
 * Centralized feature flag definitions for the application.
 * Flags can be controlled via environment variables or runtime configuration.
 */

/**
 * Read a boolean flag from an environment variable or string value.
 */
function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

export type DesktopShell = "tauri" | "electron";

function readDesktopShell(value: string | undefined, fallback: DesktopShell): DesktopShell {
  if (value === "tauri" || value === "electron") {
    return value;
  }
  return fallback;
}

function readEnvValue(key: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[key];
}

/**
 * Feature flag definitions.
 * Default values are set here; can be overridden via environment variables.
 */
export const FEATURE_FLAGS = {
  /**
   * Enable real-time collaboration features.
   * When false, the application operates in single-user mode only.
   * Default: false (collaboration is opt-in)
   */
  collab_enabled: readBooleanFlag(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_COLLAB_ENABLED : undefined,
    false
  ),
  /**
   * Select the desktop shell implementation.
   * Default: electron (legacy)
   */
  desktop_shell: readDesktopShell(
    readEnvValue("DESKTOP_SHELL") ?? readEnvValue("NEXT_PUBLIC_DESKTOP_SHELL"),
    "electron"
  ),
} as const;

/**
 * Check if collaboration features are enabled.
 * Use this function to gate collaboration-related code paths.
 *
 * @example
 * ```ts
 * if (isCollabEnabled()) {
 *   const manager = new CollabManager(config);
 *   await manager.start();
 * }
 * ```
 */
export function isCollabEnabled(): boolean {
  return FEATURE_FLAGS.collab_enabled;
}

/**
 * Get the configured desktop shell.
 */
export function getDesktopShell(): DesktopShell {
  return FEATURE_FLAGS.desktop_shell;
}

/**
 * Runtime feature flag overrides.
 * Allows programmatic control of feature flags for testing or dynamic configuration.
 */
let runtimeOverrides: Partial<typeof FEATURE_FLAGS> = {};

/**
 * Override a feature flag at runtime.
 * Useful for testing or dynamic feature toggling.
 *
 * @param flag - The flag name to override
 * @param value - The new value
 */
export function setFeatureFlagOverride<K extends keyof typeof FEATURE_FLAGS>(
  flag: K,
  value: (typeof FEATURE_FLAGS)[K]
): void {
  runtimeOverrides[flag] = value;
}

/**
 * Clear all runtime feature flag overrides.
 */
export function clearFeatureFlagOverrides(): void {
  runtimeOverrides = {};
}

/**
 * Get the effective value of a feature flag, considering runtime overrides.
 *
 * @param flag - The flag name to check
 * @returns The effective flag value
 */
export function getFeatureFlag<K extends keyof typeof FEATURE_FLAGS>(
  flag: K
): (typeof FEATURE_FLAGS)[K] {
  if (flag in runtimeOverrides) {
    return runtimeOverrides[flag] as (typeof FEATURE_FLAGS)[K];
  }
  return FEATURE_FLAGS[flag];
}

/**
 * Check if collaboration is enabled, considering runtime overrides.
 */
export function isCollabEnabledWithOverrides(): boolean {
  return getFeatureFlag("collab_enabled");
}
