/**
 * Quota Module
 *
 * Provides resource quota management for agent runtime.
 */

export {
  createQuotaManager,
  createTieredQuotaManager,
  QUOTA_PRESETS,
  type QuotaCheckResult,
  type QuotaConfig,
  type QuotaLimit,
  QuotaManager,
  type QuotaManagerConfig,
  type QuotaScope,
  type QuotaScopeType,
  type QuotaUsageSummary,
  type ResourceType,
  type ResourceUsage,
} from "./quotaManager";
