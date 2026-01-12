# AI-Native UI Integration Architecture

## Overview

The AI-Native integration transforms the editor and chat interface into a proactive, transparent workspace by exposing model confidence, provenance, and speculative suggestions.

---

## 1. AI Metadata Protocol (SSE)

To support transparency, the `/api/ai/chat` endpoint extends the standard OpenAI SSE protocol with a custom `metadata` event.

### 1.1 Metadata Event Schema
Before the `[DONE]` marker, the server sends a JSON payload containing confidence and provenance data.

```typescript
interface AIMetadata {
  confidence: number;      // 0-1 score
  provenance: {
    model_id: string;      // Model identifier
    prompt_hash?: string;  // SHA-256 hash of prompt content
    prompt_template_id?: string; // Prompt template identifier
    input_context_hashes?: string[]; // Hashes for injected context slices
    temperature?: number;  // Generation temperature
    request_id: string;    // Trace ID
  };
}
```

### 1.2 Processing Flow
1. **Source**: Backend calculates confidence (currently based on length/heuristics, transitionable to logprobs).
2. **Transport**: Injected as a `data: { "metadata": ... }\n\n` chunk into the ReadableStream.
3. **Consumption**: `aiClientService.ts` parses the chunk during streaming and updates the `AIStreamResult`.

---

## 2. Confidence Visualization

Confidence is surfaced via the `ConfidenceBadge` component, providing immediate visual trust signals.

### 2.1 Confidence Levels
- **High (>= 0.8)**: Green (Emerald)
- **Medium (0.6 - 0.79)**: Amber
- **Low (< 0.6)**: Rose (Red)

### 2.2 Provenance Tooltip
Hovering over the badge reveals technical metadata:
- Exact model name
- Request ID for debugging
- Generation parameters

---

## 3. Ghost Text (Speculative Edit Pipeline)

Ghost text provides a non-blocking way for AI to suggest content directly in the editor flow.

### 3.1 Components
- **`useGhostTextStream`**: Manages state, visibility timers, and partial acceptance logic.
- **`GhostTextContext`**: Shared state provider for editor overlays.
- **`EditorGhostTextOverlay`**: A ProseMirror-aware overlay that renders text relative to the cursor.

### 3.2 Interaction Lifecycle
1. **Trigger**: An AI agent emits a `DocumentEditEvent` or the chat initiates a suggestion.
2. **Flicker-Free Show**: `show()` is called with a 100ms debounce delay.
3. **Acceptance**:
   - **Tab**: Full accept.
   - **Ctrl + Right**: Word-by-word accept.
   - **Ctrl + End**: Line-by-line accept.
4. **Auto-Hide**: Suggestion vanishes after 3 seconds of inactivity or upon rejection (Esc).

---

## 4. Backend Refactoring

The AI API implementation follows a "Clean Route" pattern to keep cyclomatic complexity low despite complex streaming logic.

- **`validateRequest`**: Encapsulates all auth and capability logic.
- **`prepareProviderMessages`**: Maps internal context/history to OpenAI format.
- **`handleStreamResponse`**: Encapsulates SSE encoding and metadata injection.
