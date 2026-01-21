# Multi-Server Stateless Architecture

**Version:** 1.0.0  
**Last Updated:** 2026-01-09  
**Status:** Implemented

## Overview

This document describes the multi-server collaboration architecture for LFCC. The design follows local-first principles where **clients are the authority** for document state, and servers act as stateless message routers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Load Balancer                                   │
│                    (Document ID-based routing / sticky)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
         ┌──────────┴──────────┐ ┌──────┴──────┐ ┌──────────┴──────────┐
         │                     │ │             │ │                     │
         ▼                     ▼ ▼             ▼ ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Server A       │   │  Server B       │   │  Server C       │
│  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │
│  │ Stateless │  │   │  │ Stateless │  │   │  │ Stateless │  │
│  │  Relay    │  │   │  │  Relay    │  │   │  │  Relay    │  │
│  └─────┬─────┘  │   │  └─────┬─────┘  │   │  └─────┬─────┘  │
│        │        │   │        │        │   │        │        │
│  ┌─────▼─────┐  │   │  ┌─────▼─────┐  │   │  ┌─────▼─────┐  │
│  │Connection │  │   │  │Connection │  │   │  │Connection │  │
│  │  Mapping  │  │   │  │  Mapping  │  │   │  │  Mapping  │  │
│  │(in-memory)│  │   │  │(in-memory)│  │   │  │(in-memory)│  │
│  └───────────┘  │   │  └───────────┘  │   │  └───────────┘  │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Redis Pub/Sub     │
                    │  (Message Routing)  │
                    │                     │
                    │  Channels:          │
                    │  - lfcc:doc:{docId} │
                    │  - lfcc:presence:*  │
                    └─────────────────────┘
```

## Key Principles

### 1. Stateless Servers

Server instances maintain **only ephemeral state**:
- Connection mappings (WebSocket → document)
- Rate limit counters (per-connection)
- No document content or CRDT state

**Benefits:**
- Easy horizontal scaling (add/remove servers)
- No data synchronization between servers
- Server failures don't affect data integrity

### 2. Client Authority

In local-first architecture, **clients own their data**:
- Clients maintain complete document state locally
- Servers route messages, don't store content
- Snapshots come from connected clients, not servers

**Data Flow:**
```
Client A (has doc) ──┬──► Server ──► Redis ──► Server ──► Client B (new)
                     │                                         │
                     └────────────────────────────────────────►│
                            Direct snapshot transfer
```

### 3. Message Routing

All collaboration messages flow through Redis Pub/Sub:

| Message Type | Description | Routing |
|--------------|-------------|---------|
| `CRDT_UPDATE` | Document changes | Broadcast to all clients |
| `PRESENCE` | Cursor/selection | Broadcast to all clients |
| `JOIN` | Client connected | Broadcast to all clients |
| `LEAVE` | Client disconnected | Broadcast to all clients |
| `SNAPSHOT_REQUEST` | New client needs state | Routed to clients with data |
| `SNAPSHOT_RESPONSE` | Snapshot delivery | Routed to requesting client |

## Implementation

### Redis Adapter

```typescript
// Create adapter (development)
const adapter = createInMemoryMessageBus();

// Create adapter (production)
const adapter = await createRedisAdapter({
  redisUrl: "redis://localhost:6379",
});

await adapter.connect();
```

### Stateless Relay

```typescript
const relay = new StatelessCollabRelay({
  redisAdapter: adapter,
  serverId: generateServerId(),
  enableBatching: true,
  enableRateLimiting: true,
});

await relay.initialize();

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  const docId = extractDocId(req);
  const senderId = generateClientId();
  
  relay.handleConnection(ws, docId, senderId);
  
  ws.on("message", (data) => {
    relay.handleMessage(ws, data.toString());
  });
  
  ws.on("close", () => {
    relay.handleDisconnection(ws);
  });
});
```

## Snapshot Strategy

### New Client Sync

When a new client connects to a document:

1. **Check local clients**: Server asks connected clients with `hasSnapshot: true`
2. **Request from Redis**: If no local snapshots, broadcast `SNAPSHOT_REQUEST`
3. **Wait for response**: Other servers' clients respond with snapshot
4. **Timeout fallback**: Client creates empty document (rare case)

```
New Client ──► Server A ──► "Any snapshots?"
                   │
                   ├──► Local Client 1 (no snapshot)
                   │
                   ├──► Redis ──► Server B ──► Client 2 (has snapshot!)
                   │                              │
                   │◄───────────────────────────────┘
                   │        SNAPSHOT_RESPONSE
                   ▼
New Client ◄── Snapshot delivered
```

### Snapshot Sources (Priority)

1. **Local clients** on same server (fastest)
2. **Remote clients** via Redis (cross-server)
3. **Optional: Redis/S3 cache** for frequently accessed docs
4. **Fallback**: Empty document (new doc case)

## Scaling Considerations

### Horizontal Scaling

| Metric | Single Server | Multi-Server |
|--------|--------------|--------------|
| Connections | ~10,000 | ~10,000 per server |
| Documents | ~5,000 | ~5,000 per server |
| Latency | <10ms | <50ms (cross-server) |

### Load Balancing

**Recommended: Document-based sticky sessions**

```nginx
upstream collab_servers {
  hash $arg_docId consistent;
  server server1:3030;
  server server2:3030;
  server server3:3030;
}
```

This ensures clients for the same document connect to the same server, reducing cross-server traffic.

### Redis Configuration

```yaml
# redis.conf for production
maxmemory 1gb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 0
```

**Recommended: Redis Cluster for high availability**

## Failure Scenarios

### Server Crash

1. Load balancer detects unhealthy server
2. Clients reconnect to healthy server
3. Clients request snapshot from peers
4. Collaboration continues

**No data loss** because clients maintain local state.

### Redis Unavailable

1. Local routing continues (same-server clients)
2. Cross-server sync pauses
3. Messages queued in memory (with limit)
4. Auto-reconnect when Redis recovers

### Network Partition

1. Each partition continues independently
2. Clients sync with local peers
3. When partition heals, CRDT merges changes
4. Eventual consistency guaranteed

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `redis.connection_state` | Redis connection status | != "connected" |
| `relay.remote_messages` | Cross-server messages | > 1000/s |
| `relay.snapshot_requests` | Snapshot requests | > 100/s |
| `relay.active_documents` | Unique documents | > 5000 |

### Health Check

```bash
curl http://localhost:3030/health
```

```json
{
  "ok": true,
  "status": "healthy",
  "serverId": "server-1704844800000-abc123",
  "redis": {
    "connected": true,
    "activeSubscriptions": 150
  },
  "connections": 1234,
  "documents": 567
}
```

## Migration Guide

### From Single Server

1. Deploy Redis instance
2. Configure load balancer
3. Deploy additional server instances
4. Gradual traffic migration

### Configuration Changes

```typescript
// Before (single server)
const server = new CollabServer({
  port: 3030,
  jwtSecret: process.env.JWT_SECRET,
});

// After (multi-server)
const relay = new StatelessCollabRelay({
  serverId: `server-${process.env.POD_NAME}`,
  redisAdapter: await createRedisAdapter({
    redisUrl: process.env.REDIS_URL,
  }),
});
```

## Security Considerations

### Redis Authentication

```typescript
const adapter = await createRedisAdapter({
  redisUrl: "redis://:password@host:6379",
});
```

### Message Validation

All routed messages are validated:
- Source server ID verification
- Message deduplication (by messageId)
- Rate limiting per client

### Network Security

- Use Redis TLS in production
- Restrict Redis access to server VPC
- Enable Redis ACLs for fine-grained access

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-09 | Initial release |
