/**
 * Quota Module
 *
 * Provides resource quota management for agent runtime.
 */

export {
  QuotaManager,
  createQuotaManager,
  createTieredQuotaManager,
  QUOTA_PRESETS,
  type ResourceType,
  type QuotaLimit,
  type QuotaConfig,
  type QuotaScopeType,
  type QuotaScope,
  type ResourceUsage,
  type QuotaCheckResult,
  type QuotaUsageSummary,
  type QuotaManagerConfig,
} from "./quotaManager";
