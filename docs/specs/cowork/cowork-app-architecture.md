# Cowork Application Architecture

## System Overview
The Cowork application provides a resilient, multi-agent environment for collaborative AI tasks. It leverages a structured event-driven architecture to ensure consistency and recovery across distributed components.

---

## 1. Event Streaming & Resilience

### 1.1 Durable SSE Resume
The application uses Server-Sent Events (SSE) for real-time updates. To ensure reliability across client refreshes or server restarts, a durable event store is implemented.

**Durable Event Store Schema:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key for the event |
| `sequenceId` | BigInt | Strictly increasing sequence number for ordering |
| `type` | String | Event type (e.g., `message.created`, `artifact.updated`) |
| `payload` | JSONB | Structured event data |
| `sessionId` | UUID | Scope of the event |
| `createdAt` | DateTime | Persistence timestamp |

**Reliability Mechanism:**
- **Sequence IDs**: All events are assigned a strictly increasing `sequenceId`.
- **Last-Event-ID**: Clients include the `Last-Event-ID` header in the SSE connection request.
- **Server Replay**: On reconnection, the server queries the durable store for events where `sequenceId > Last-Event-ID` and replays them to the client.
- **Refresh Resilience**: The sequence ID is stored in the browser's `localStorage` to persist across full page reloads.

---

## 2. API Design

### 2.1 Core API Surface
The API provides singleton access for specific operations and list/query endpoints for session hydration.

- `POST /api/approvals/:id`: Resolve a pending confirmation.
- `GET /api/artifacts/:id`: Retrieve a specific artifact.

### 2.2 Hydration & Query Endpoints
To hydrate the UI on reload or session resume, the following list endpoints are provided:

- `GET /api/artifacts?sessionId=:id`: List all artifacts for a given session.
- `GET /api/approvals?status=pending&sessionId=:id`: List all outstanding approvals.
- `GET /api/events?after=:sequenceId&sessionId=:id`: Query historical events.

---

## 3. Data Model & Concept Representation

### 3.1 Threaded Context
Messages and tasks support hierarchical threading to maintain context.
- `parentMessageId`: References the triggering message for a response thread.
- `rootMessageId`: Tracks the original query in a long conversation.

### 3.2 Task Execution Phases
Task nodes include an explicit `phase` field to represent progress:
- `planning`: Agent is decomposing the task.
- `executing`: Active tool use or computation.
- `verifying`: Validating the result.
- `finalizing`: Wrapping up and reporting.

---

## 4. Testing Strategy

### 4.1 Targeted Risk Areas
Testing must focus on recovery and concurrency edge cases:

- **SSE Resume**: Verify that a client reconnecting with a `Last-Event-ID` receives only missing events without duplicates.
- **Approval Recovery**: Test that pending approvals survive server restarts and can still be resolved by the client.
- **Multi-Agent Concurrency**: Validate state consistency when multiple agents attempt to update the same artifact or task node simultaneously.

---

## Part 5: Persistence Schema (DRAFT)
Events are persisted to a lightweight SQL store (e.g., SQLite/Postgres) with the schema defined in Section 1.1.
