/**
 * Rollout Policy Engine
 *
 * Server-authoritative policy evaluation for enabling collaboration features.
 * Supports targeted rollout via allowlists, denylists, and percentage-based rollout.
 */

/** Policy evaluation input */
export interface RolloutPolicyInput {
  /** User identifier */
  userId?: string;
  /** Team/organization identifier */
  teamId?: string;
  /** Document identifier */
  docId: string;
  /** Environment (dev/staging/prod) */
  environment: "dev" | "staging" | "prod";
  /** Client build version (optional) */
  clientVersion?: string;
}

/** Policy evaluation result */
export interface RolloutPolicyResult {
  /** Whether collaboration is enabled for this context */
  collabEnabled: boolean;
  /** Whether AI suggestions are enabled */
  aiCollabEnabled: boolean;
  /** Default role for new users */
  roleDefault: "editor" | "viewer";
  /** Policy version for debugging/tracking */
  policyVersion: number;
  /** Internal reason (for debugging, not shown to users) */
  reason?: string;
}

/** Rollout policy configuration */
export interface RolloutPolicyConfig {
  /** Policy version number */
  version: number;
  /** Master kill switch - if true, collab is OFF for everyone */
  killSwitch?: boolean;
  /** AI collab feature flag - if false, AI suggestions are disabled */
  aiCollabEnabled?: boolean;
  /** AI collab user allowlist */
  aiCollabUserAllowlist?: string[];
  /** Environment-level enable/disable (default: enabled in dev, disabled in prod) */
  environmentDefaults?: Record<"dev" | "staging" | "prod", boolean>;
  /** User ID allowlist - these users always get collab enabled */
  userAllowlist?: string[];
  /** User ID denylist - these users never get collab (overrides allowlist) */
  userDenylist?: string[];
  /** Document ID allowlist - these docs always have collab enabled */
  docAllowlist?: string[];
  /** Document ID denylist - these docs never have collab */
  docDenylist?: string[];
  /** Team ID allowlist - users in these teams get collab enabled */
  teamAllowlist?: string[];
  /** Percentage rollout (0-100) - % of users to enable by hash */
  rolloutPercentage?: number;
  /** Minimum client version required */
  minClientVersion?: string;
  /** Default role for new collaborators */
  defaultRole?: "editor" | "viewer";
}

const DEFAULT_CONFIG: RolloutPolicyConfig = {
  version: 1,
  killSwitch: false,
  aiCollabEnabled: false, // AI suggestions OFF by default
  aiCollabUserAllowlist: [],
  environmentDefaults: {
    dev: true,
    staging: true,
    prod: false, // Production off by default for safety
  },
  userAllowlist: [],
  userDenylist: [],
  docAllowlist: [],
  docDenylist: [],
  teamAllowlist: [],
  rolloutPercentage: 0, // No percentage rollout by default
  defaultRole: "editor",
};

/**
 * Rollout Policy Engine
 *
 * Evaluates whether collaboration should be enabled for a given context.
 * Rules are evaluated in priority order:
 *
 * 1. Kill switch (highest priority - always disables)
 * 2. User denylist
 * 3. Doc denylist
 * 4. User allowlist
 * 5. Doc allowlist
 * 6. Team allowlist
 * 7. Percentage rollout
 * 8. Environment defaults (lowest priority)
 */
export class RolloutPolicyEngine {
  private config: RolloutPolicyConfig;

  constructor(config: Partial<RolloutPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate the rollout policy for a given context.
   */
  evaluate(input: RolloutPolicyInput): RolloutPolicyResult {
    const baseResult: Omit<RolloutPolicyResult, "collabEnabled" | "aiCollabEnabled" | "reason"> = {
      roleDefault: this.config.defaultRole ?? "editor",
      policyVersion: this.config.version,
    };

    // Evaluate AI collab status
    const aiCollabEnabled = this.evaluateAiCollab(input);

    // 1. Kill switch (highest priority)
    if (this.config.killSwitch) {
      return {
        ...baseResult,
        collabEnabled: false,
        aiCollabEnabled: false,
        reason: "kill_switch_active",
      };
    }

    // 2. User denylist
    if (input.userId && this.config.userDenylist?.includes(input.userId)) {
      return {
        ...baseResult,
        collabEnabled: false,
        aiCollabEnabled: false,
        reason: "user_denylisted",
      };
    }

    // 3. Doc denylist
    if (this.config.docDenylist?.includes(input.docId)) {
      return {
        ...baseResult,
        collabEnabled: false,
        aiCollabEnabled: false,
        reason: "doc_denylisted",
      };
    }

    // 4. Version gating
    if (this.config.minClientVersion && input.clientVersion) {
      if (!this.isVersionSatisfied(input.clientVersion, this.config.minClientVersion)) {
        return {
          ...baseResult,
          collabEnabled: false,
          aiCollabEnabled: false,
          reason: "client_version_too_old",
        };
      }
    }

    // 5. User allowlist
    if (input.userId && this.config.userAllowlist?.includes(input.userId)) {
      return {
        ...baseResult,
        collabEnabled: true,
        aiCollabEnabled,
        reason: "user_allowlisted",
      };
    }

    // 6. Doc allowlist
    if (this.config.docAllowlist?.includes(input.docId)) {
      return {
        ...baseResult,
        collabEnabled: true,
        aiCollabEnabled,
        reason: "doc_allowlisted",
      };
    }

    // 7. Team allowlist
    if (input.teamId && this.config.teamAllowlist?.includes(input.teamId)) {
      return {
        ...baseResult,
        collabEnabled: true,
        aiCollabEnabled,
        reason: "team_allowlisted",
      };
    }

    // 8. Percentage rollout (by user ID hash)
    if (
      this.config.rolloutPercentage !== undefined &&
      this.config.rolloutPercentage > 0 &&
      input.userId
    ) {
      const bucket = this.getUserBucket(input.userId);
      if (bucket < this.config.rolloutPercentage) {
        return {
          ...baseResult,
          collabEnabled: true,
          aiCollabEnabled,
          reason: `percentage_rollout_bucket_${bucket}`,
        };
      }
    }

    // 9. Environment defaults
    const envEnabled = this.config.environmentDefaults?.[input.environment] ?? false;
    return {
      ...baseResult,
      collabEnabled: envEnabled,
      aiCollabEnabled: envEnabled && aiCollabEnabled,
      reason: envEnabled
        ? `environment_${input.environment}_enabled`
        : `environment_${input.environment}_disabled`,
    };
  }

  /**
   * Evaluate AI collab feature flag.
   */
  private evaluateAiCollab(input: RolloutPolicyInput): boolean {
    // Check global AI collab flag
    if (!this.config.aiCollabEnabled) {
      // Check user allowlist for AI
      if (input.userId && this.config.aiCollabUserAllowlist?.includes(input.userId)) {
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Update the policy configuration.
   * Call this to apply runtime policy changes without restart.
   */
  updateConfig(config: Partial<RolloutPolicyConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      version: (this.config.version ?? 0) + 1,
    };
  }

  /**
   * Get the current policy configuration.
   */
  getConfig(): RolloutPolicyConfig {
    return { ...this.config };
  }

  /**
   * Activate the kill switch (immediately disables collab for all users).
   */
  activateKillSwitch(): void {
    this.config.killSwitch = true;
    this.config.version = (this.config.version ?? 0) + 1;
  }

  /**
   * Deactivate the kill switch.
   */
  deactivateKillSwitch(): void {
    this.config.killSwitch = false;
    this.config.version = (this.config.version ?? 0) + 1;
  }

  /**
   * Hash a user ID to a bucket (0-99) for percentage rollout.
   */
  private getUserBucket(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash) % 100;
  }

  /**
   * Check if a version string satisfies the minimum version requirement.
   * Simple semver-like comparison.
   */
  private isVersionSatisfied(current: string, minimum: string): boolean {
    const parseVersion = (v: string): number[] =>
      v.split(".").map((s) => Number.parseInt(s, 10) || 0);

    const currentParts = parseVersion(current);
    const minimumParts = parseVersion(minimum);

    for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
      const c = currentParts[i] ?? 0;
      const m = minimumParts[i] ?? 0;
      if (c > m) {
        return true;
      }
      if (c < m) {
        return false;
      }
    }
    return true; // Equal versions
  }
}
