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
  MessageBatcher,
  type MessageBatcherConfig,
  type BatchMetrics,
  type BatchedMessage,
} from "./messageBatcher";

export {
  RateLimiter,
  type RateLimiterConfig,
  type RateLimitResult,
  type RateLimitMetrics,
} from "./rateLimiter";

export {
  BackpressureHandler,
  type BackpressureConfig,
  type BackpressureAction,
  type BackpressureMetrics,
} from "./backpressureHandler";

export {
  SnapshotPolicy,
  type SnapshotPolicyConfig,
  type SnapshotCheckResult,
  type SnapshotTriggerReason,
  type SnapshotMetrics,
} from "./snapshotPolicy";

export {
  ReconnectManager,
  type ReconnectManagerConfig,
  type ReconnectResult,
  type ReconnectMetrics,
  type ResyncType,
  type ReconnectPersistenceAdapter,
} from "./reconnectManager";

export {
  ScaledCollabRelay,
  type ScaledCollabRelayConfig,
  type ScaledCollabConnection,
  type ScaleErrorCode,
  type ScaleMetrics,
} from "./scaledCollabRelay";

// Redis Pub/Sub Adapter
export {
  type IRedisAdapter,
  type RedisAdapterConfig,
  type RedisAdapterMetrics,
  type RedisConnectionState,
  type RoutedMessage,
  InMemoryMessageBus,
  createInMemoryMessageBus,
  createRedisAdapter,
  createStatelessRelay,
  generateServerId,
} from "./redisAdapter";

// Production Redis Adapter
export {
  ProductionRedisAdapter,
  createProductionRedisAdapter,
  type ProductionRedisConfig,
  type RedisClient,
  type RedisClientFactory,
} from "./productionRedisAdapter";

// Stateless Relay
export {
  StatelessCollabRelay,
  type StatelessRelayConfig,
  type StatelessConnection,
  type StatelessRelayMetrics,
} from "./statelessRelay";

// Consistent Hashing
export {
  ConsistentHashRing,
  createHashRing,
  createServerNode,
  type ServerNode,
  type HashRingConfig,
  type RoutingResult,
} from "./consistentHashing";

// Health Monitoring
export {
  HealthMonitor,
  createHealthMonitor,
  createHttpChecker,
  createRedisChecker,
  type HealthMonitorConfig,
  type HealthCheckResult,
  type NodeHealthState,
  type HealthStatus,
  type HealthEvent,
  type HealthEventListener,
  type HealthChecker,
} from "./healthCheck";
