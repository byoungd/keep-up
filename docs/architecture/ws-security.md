# WebSocket Security Architecture

**Version:** 1.0.0  
**Last Updated:** 2026-01-09  
**Status:** Implemented

## Overview

This document describes the security architecture for WebSocket connections in the LFCC collaboration server. The design provides comprehensive protection including authentication, authorization, rate limiting, and connection lifecycle management.

## Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Client Connection Request                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    1. Token Extraction                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Bearer Token │ │ Query Param  │ │ SubProtocol  │ │ Cookie       │        │
│  │ (Header)     │ │ (?token=)    │ │ (auth.xxx)   │ │ (NextAuth)   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    2. Authentication                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  NextAuthProvider / JwtSessionAuthProvider                           │   │
│  │  - JWT signature verification (HS256/HS384/HS512)                    │   │
│  │  - Expiration check with clock tolerance                             │   │
│  │  - User identity extraction                                          │   │
│  │  - Role extraction                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    3. Authorization                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  - User connection limit check (max 10 per user)                     │   │
│  │  - Document access check (if restricted)                             │   │
│  │  - Role-based permissions (viewer/editor/admin)                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    4. Connection Registration                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  - Generate unique connection ID                                     │   │
│  │  - Initialize rate limit state                                       │   │
│  │  - Set up health monitoring (ping/pong)                              │   │
│  │  - Configure timeouts (idle, max duration)                           │   │
│  │  - Emit audit event                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    5. Runtime Protection                                     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│  │ Rate Limiting │ │ Idle Timeout  │ │ Max Duration  │ │ Heartbeat     │   │
│  │ (per conn)    │ │ (5 min)       │ │ (24 hours)    │ │ (30s ping)    │   │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Authentication

### Token Sources (Priority Order)

1. **Authorization Header**: `Authorization: Bearer <token>`
2. **Query Parameter**: `?token=<token>`
3. **WebSocket Subprotocol**: `Sec-WebSocket-Protocol: auth.<token>`
4. **Cookie**: NextAuth session cookies (`next-auth.session-token` or `__Secure-next-auth.session-token`)

### JWT Validation

```typescript
// Supported algorithms
algorithms: ["HS256", "HS384", "HS512"]

// Clock tolerance for exp/nbf validation
clockTolerance: 60 // seconds

// Required claims
sub: string       // User ID
role?: AuthRole   // Optional: "viewer" | "editor" | "admin"
exp?: number      // Optional: Expiration timestamp
```

### Auth Providers

| Provider | Use Case | Signature Verification |
|----------|----------|----------------------|
| `NextAuthProvider` | Production with NextAuth | Full HMAC verification |
| `JwtSessionAuthProvider` | Generic JWT | Full HMAC verification |
| `JwtAuthAdapter` | Legacy compatibility | Full HMAC verification |
| `DevHmacAuthProvider` | Development only | Simple hash (NOT secure) |

## Rate Limiting

### Per-Connection Limits

| Metric | Default | Description |
|--------|---------|-------------|
| Messages/minute | 300 | Maximum messages per connection per minute |
| Bytes/minute | 1 MB | Maximum bytes per connection per minute |
| Connections/user | 10 | Maximum concurrent connections per user |
| Burst multiplier | 1.5x | Temporary burst allowance |

### Token Bucket Algorithm

```typescript
// Rate limit check
check(connectionId: string, messageBytes: number): {
  allowed: boolean;
  retryAfterMs?: number;
}

// State tracked per connection
{
  messagesInWindow: number;
  bytesInWindow: number;
  windowStartMs: number;
  burstTokens: number;
}
```

### Rate Limit Response

When rate limited, the server sends:

```json
{
  "type": "error",
  "payload": {
    "code": "RATE_LIMITED",
    "retryAfterMs": 1500,
    "message": "Rate limit exceeded"
  }
}
```

## Connection Lifecycle

### Timeouts

| Timeout | Default | Description |
|---------|---------|-------------|
| Handshake | 10s | Time to complete authentication handshake |
| Idle | 5 min | Time without any message activity |
| Max Duration | 24 hours | Maximum connection lifetime |
| Ping Interval | 30s | Heartbeat ping frequency |
| Pong Timeout | 10s | Time to receive pong after ping |

### Health Monitoring

```
Client                Server
  │                     │
  │◄────── ping ────────│ (every 30s)
  │                     │
  │────── pong ────────►│ (must respond within 10s)
  │                     │
  │    [if no pong]     │
  │                     │
  │◄── connection ──────│ (terminate)
  │    terminated       │
```

### Connection States

```
┌──────────────────────────────────────────────────────────────────┐
│                     Connection State Machine                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐    auth ok    ┌───────────┐   handshake   ┌────────┐│
│  │Connecting├─────────────►│Authenticated├────────────►│ Active ││
│  └────┬────┘               └─────┬─────┘               └───┬────┘│
│       │                          │                         │     │
│       │ auth fail                │ timeout                 │     │
│       ▼                          ▼                         │     │
│  ┌─────────┐              ┌───────────┐                    │     │
│  │ Rejected│              │  Timeout  │◄───────────────────┘     │
│  └─────────┘              └───────────┘   idle/duration          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Audit Logging

### Event Types

| Event | Description |
|-------|-------------|
| `connection_attempt` | New connection request received |
| `connection_established` | Connection successfully authenticated |
| `connection_rejected` | Connection rejected (auth failed, limit exceeded) |
| `connection_closed` | Connection terminated (normal or error) |
| `auth_success` | Authentication succeeded |
| `auth_failure` | Authentication failed |
| `rate_limited` | Message rejected due to rate limit |
| `timeout` | Connection terminated due to timeout |

### Audit Event Structure

```typescript
interface SecurityAuditEvent {
  type: EventType;
  timestamp: number;
  connectionId: string;
  userId?: string;
  docId?: string;
  remoteAddress: string;
  details?: Record<string, unknown>;
}
```

### Sample Audit Log

```jsonl
{"type":"connection_attempt","timestamp":1704844800000,"connectionId":"conn-1704844800000-abc123","docId":"doc-456","remoteAddress":"192.168.1.100","details":{"userAgent":"Mozilla/5.0..."}}
{"type":"auth_success","timestamp":1704844800050,"connectionId":"conn-1704844800000-abc123","userId":"user-789","docId":"doc-456","remoteAddress":"192.168.1.100","details":{"role":"editor"}}
{"type":"connection_established","timestamp":1704844800100,"connectionId":"conn-1704844800000-abc123","userId":"user-789","docId":"doc-456","remoteAddress":"192.168.1.100","details":{"role":"editor"}}
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes | JWT secret for token verification |
| `WS_ALLOW_ANONYMOUS` | No | Allow anonymous connections (dev only) |
| `WS_MAX_CONNECTIONS_PER_USER` | No | Override default connection limit |

### Server Configuration

```typescript
const server = new CollabServer({
  port: 3030,
  jwtSecret: process.env.NEXTAUTH_SECRET,
  allowAnonymous: false, // MUST be false in production
  environment: "prod",
  // Security middleware is automatically configured
});
```

## Security Checklist

### Production Deployment

- [ ] `NEXTAUTH_SECRET` is set and cryptographically random (min 32 bytes)
- [ ] `allowAnonymous` is `false`
- [ ] HTTPS/WSS is enabled (TLS termination at load balancer or server)
- [ ] Rate limits are appropriate for your use case
- [ ] Audit logging is enabled and logs are monitored
- [ ] Connection limits are appropriate for your infrastructure

### Development Mode

- [ ] Use `DevHmacAuthProvider` or `allowAnonymous: true`
- [ ] Never use development settings in production

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_TOKEN` | 401 | No authentication token provided |
| `INVALID_TOKEN` | 401 | Token format invalid or signature verification failed |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `TOKEN_REVOKED` | 401 | Token has been revoked |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `MAX_CONNECTIONS` | 429 | Maximum connections per user exceeded |

## Integration Examples

### Client-Side Authentication

```typescript
// Using Authorization header
const ws = new WebSocket("wss://collab.example.com/doc-123", {
  headers: {
    Authorization: `Bearer ${sessionToken}`,
  },
});

// Using query parameter (fallback)
const ws = new WebSocket(`wss://collab.example.com/doc-123?token=${sessionToken}`);

// Using subprotocol
const ws = new WebSocket("wss://collab.example.com/doc-123", [`auth.${sessionToken}`]);
```

### Server-Side Token Generation (NextAuth)

```typescript
// In your NextAuth configuration
export const authOptions = {
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teamId = user.teamId;
      }
      return token;
    },
  },
};
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-09 | Initial release |
