/**
 * Scale Hardening Module
 *
 * Exports for server-side scale hardening components.
 *
 * Features:
 * - Message batching and rate limiting
 * - Backpressure handling
 * - Snapshot policies
 * - Multi-server support with Redis
 * - Consistent hashing for horizontal scaling
 * - Health monitoring and graceful failover
 */

export {
  type BackpressureAction,
  type BackpressureConfig,
  BackpressureHandler,
  type BackpressureMetrics,
} from "./backpressureHandler";
// Consistent Hashing
export {
  ConsistentHashRing,
  createHashRing,
  createServerNode,
  type HashRingConfig,
  type RoutingResult,
  type ServerNode,
} from "./consistentHashing";
// Health Monitoring
export {
  createHealthMonitor,
  createHttpChecker,
  createRedisChecker,
  type HealthChecker,
  type HealthCheckResult,
  type HealthEvent,
  type HealthEventListener,
  HealthMonitor,
  type HealthMonitorConfig,
  type HealthStatus,
  type NodeHealthState,
} from "./healthCheck";
export {
  type BatchedMessage,
  type BatchMetrics,
  MessageBatcher,
  type MessageBatcherConfig,
} from "./messageBatcher";
// Production Redis Adapter
export {
  createProductionRedisAdapter,
  ProductionRedisAdapter,
  type ProductionRedisConfig,
  type RedisClient,
  type RedisClientFactory,
} from "./productionRedisAdapter";
export {
  RateLimiter,
  type RateLimiterConfig,
  type RateLimitMetrics,
  type RateLimitResult,
} from "./rateLimiter";
export {
  ReconnectManager,
  type ReconnectManagerConfig,
  type ReconnectMetrics,
  type ReconnectPersistenceAdapter,
  type ReconnectResult,
  type ResyncType,
} from "./reconnectManager";
// Redis Pub/Sub Adapter
export {
  createInMemoryMessageBus,
  createRedisAdapter,
  createStatelessRelay,
  generateServerId,
  InMemoryMessageBus,
  type IRedisAdapter,
  type RedisAdapterConfig,
  type RedisAdapterMetrics,
  type RedisConnectionState,
  type RoutedMessage,
} from "./redisAdapter";
export {
  type ScaledCollabConnection,
  ScaledCollabRelay,
  type ScaledCollabRelayConfig,
  type ScaleErrorCode,
  type ScaleMetrics,
} from "./scaledCollabRelay";
export {
  type SnapshotCheckResult,
  type SnapshotMetrics,
  SnapshotPolicy,
  type SnapshotPolicyConfig,
  type SnapshotTriggerReason,
} from "./snapshotPolicy";
// Stateless Relay
export {
  StatelessCollabRelay,
  type StatelessConnection,
  type StatelessRelayConfig,
  type StatelessRelayMetrics,
} from "./statelessRelay";
