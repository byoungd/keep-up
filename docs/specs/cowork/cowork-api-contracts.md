# Cowork API Contracts

> **Purpose**: Define concrete HTTP/REST contracts for the Cowork system.
> **Auth**: All endpoints require `Authorization: Bearer <session_token>` header.

**Related Specs:**
- [Data Flow Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-data-flow-spec.md) — SSE Protocol details
- [Persistence Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-persistence-spec.md) — DB schema alignment
- [Agent Runtime Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/agent-runtime-spec-2026.md) — Runtime contracts

---

## 1. Sessions & Tasks

### 1.1 Create Session
`POST /api/cowork/sessions`
*   **Body**: `{ grants: FolderGrant[], connectors: ConnectorGrant[] }`
*   **Response**: `201 Created` -> `CoworkSession`

### 1.2 List Tasks
`GET /api/cowork/sessions/:sessionId/tasks`
*   **Query**: `?status=running|completed&limit=50`
*   **Response**: `200 OK` -> `CoworkTask[]`

### 1.3 Create Task
`POST /api/cowork/sessions/:sessionId/tasks`
*   **Body**: `{ prompt: string, model?: string, contextFiles?: string[] }`
*   **Response**: `201 Created` -> `CoworkTask` (Optimistic)

### 1.4 Task Control
*   `POST /api/cowork/tasks/:taskId/stop` -> Stop Execution
*   `POST /api/cowork/tasks/:taskId/feedback` -> `{ feedback: string }`

---

## 2. Real-Time (SSE)

`GET /api/cowork/sessions/:sessionId/events`
*   **Description**: The persistent event stream.
*   **Protocol**: See `cowork-data-flow-spec.md`.

---

## 3. Cost & Usage API

### 3.1 Get Usage Stats
`GET /api/cowork/sessions/:sessionId/usage`
*   **Response**:
    ```ts
    interface UsageStats {
      totalTokens: number;
      totalCostUSD: number;
      breakdown: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
      }[];
    }
    ```

### 3.2 Get Token Budget
`GET /api/cowork/config/budget`
*   **Response**: `{ dailyLimitUSD: number, remainingUSD: number }`

---

## 4. Project Context API

### 4.1 Sync Context
`POST /api/cowork/context/sync`
*   **Body**: `{ files: string[] }` (List of file paths changed/added)
*   **Response**: `200 OK` (Accepted for background indexing)

### 4.2 Query Context
`POST /api/cowork/context/query`
*   **Body**: `{ query: string, topK: number }`
*   **Response**: `ContextItem[]`

---

## 5. Artifacts API

### 5.1 Get Artifact Content
`GET /api/cowork/artifacts/:artifactId/content`
*   **Response**: Raw bytes (Octet Stream) or JSON.

### 5.2 List Artifacts
`GET /api/cowork/tasks/:taskId/artifacts`
*   **Response**: `ArtifactMetadata[]`
