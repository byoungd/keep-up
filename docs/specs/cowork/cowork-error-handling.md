# Cowork Error Handling & Resilience Spec

> **Philosophy**: **"Fail Gracefully, Recover Automatically"**.
> The user should never see a raw JSON error or a white screen.

**Related Specs:**
- [Agent Runtime Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/agent-runtime-spec-2026.md) — Error Recovery Contract (Sec 5.10)
- [Data Flow Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-data-flow-spec.md) — SSE reconnection
- [Testing Strategy](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-testing-strategy.md) — Error scenarios to test

---

## 1. Error Categories

| Category | Example | Strategy | UI Feedback |
| :--- | :--- | :--- | :--- |
| **Transient Network** | `ECONNRESET`, 503 | **Auto-Retry** (Exp. Backoff) | "Reconnecting..." (Amber Toast) |
| **Permanent Network** | 404, 401 | **Fail Fast** | "Disconnected. Please sign in." (Modal) |
| **LLM Hallucination** | Invalid JSON | **Self-Correction** | "Thinking... (Retrying)" |
| **Runtime Crash** | Node Process Exit | **Restart Service** | "Service restarted." |
| **User Logic** | Tool Error | **Agent Feedback** | Agent explains error in chat. |

## 2. Retry Strategies

### 2.1 SSE Reconnection (Client-Side)
The `useCoworkStore` MUST implement robust reconnection logic.
```ts
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

function connect() {
  const eventSource = new EventSource(url);
  eventSource.onerror = () => {
    if (retries < MAX_RETRIES) {
      setTimeout(connect, BASE_DELAY * Math.pow(2, retries));
    } else {
      showFatalError("Connection lost.");
    }
  };
}
```

### 2.2 LLM Parsers (Server-Side)
When an LLM outputs malformed JSON (e.g., trailing commas), we DO NOT fail the turn.
1.  **Attempt Repair**: Use `json5` or regex repair.
2.  **Retry Prompt**: Feed the error back to the LLM: *"You output invalid JSON. Fix it."*

## 3. Graceful Degradation

### 3.1 Offline Mode
If the server is unreachable:
1.  **Read-Only**: User can view past logs/artifacts (cached locally).
2.  **Queue**: New prompts are queued and sent when online.

### 3.2 Context Limits
If Context exceeds the model limit:
1.  **Summarize**: Runtime automatically summarizes older turns.
2.  **Warning**: UI warns "Conversation getting long. Memory compressed."

## 4. User-Facing Error Messages

Never blame the user.
*   ❌ "Invalid Input."
*   ✅ "I couldn't understand that. Could you rephrase?"

*   ❌ "Server Error 500."
*   ✅ "Something went wrong on our end. Retrying..."
