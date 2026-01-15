# Cowork Application Specification

## Product Overview
Cowork is an AI-native collaboration platform that enables users to work alongside multiple AI agents. It focuses on transparency, explicit task management, and verifiable artifact generation.

---

## 1. Core Feature Set

### 1.1 Threaded Context & Conversation
The platform maintains high-fidelity context through threaded messaging.
- Users can branch from any message to explore alternative paths.
- Agents maintain context of the specific thread they are participating in.

### 1.2 Task Management & Phases
Tasks are not mere text outputs but structured graph nodes with explicit phases.
- **Phases**: `planning`, `executing`, `verifying`, `finalizing`.
- Users can monitor progress through these phases in real-time.

---

## 2. Data Model

### 2.1 Communication Schema
| Entity | Field | Type | Description |
|--------|-------|------|-------------|
| **Message** | `id` | UUID | Unique identifier |
| | `content` | Text | Message body |
| | `parentMessageId` | UUID? | Reference for threading (Finding addressed) |
| | `rootMessageId` | UUID? | Reference to original query |
| | `senderId` | String | User or Agent ID |
| | `createdAt` | DateTime | |

### 2.2 Task Schema
| Entity | Field | Type | Description |
|--------|-------|------|-------------|
| **Task** | `id` | UUID | Unique identifier |
| | `title` | String | Narrative description |
| | `phase` | Enum | Current execution stage (Finding addressed) |
| | `status` | Enum | `pending`, `running`, `completed`, `failed` |
| | `assignedAgentId` | String? | ID of the agent owning the task |
| | `dependencies` | UUID[] | List of parent task IDs |

---

## 3. User Flows

### 3.1 Artifact Approvals
When an agent proposes an action that requires user oversight (e.g., file deletion, payments):
1. Agent creates an **Approval Request**.
2. UI displays a notification and a confirmation dialog.
3. User reviews details and submits `POST /api/approvals/:id`.
4. Agent resumes execution based on the result.

### 3.2 Artifact Gallery
A central location to view all structured outputs (documents, images, code).
- Hydrated via `GET /api/artifacts`.
- Allows version history and side-by-side comparison.

---

## 4. Verification Requirements
- **SSE Resume Reliability**: Must recover stream without data loss after network flap.
- **State Consistency**: Data model changes (threading, phases) must be reflected in all task graph events.
- **Concurrency**: State updates must be idempotent and handle simultaneous agent writes.
