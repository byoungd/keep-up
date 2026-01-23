# Track AS: Model Fabric and Routing (Rust)

> Priority: P1
> Status: Proposed
> Owner: AI Core Team
> Dependencies: Track AU storage
> Estimated Effort: 2 weeks

---

## Overview

Create a Rust-first model fabric that manages provider configs, local model endpoints,
and routing policy. This brings BYOK and local OpenAI-compatible servers into the
runtime without relying on TypeScript for request execution.

## Architecture Context

- Product context: Open Wrap. This track targets model execution and routing.
- Runtime boundary: Rust owns provider configs, routing, and HTTP execution.
- TypeScript provides configuration UI and displays usage/health.

## Scope

- Provider registry and credential storage.
- Local model endpoint configuration (OpenAI-compatible servers).
- Routing policy for model selection per task or worker.
- Usage metering and cost tracking per provider.

## Out of Scope

- UI redesigns for settings pages.
- Fine-tuning or training workflows.
- Model caching beyond request-level retries.

## Deliverables

- `packages/model-fabric-rs/` crate for provider management and request routing.
- `packages/ai-core/` adapters to call Rust model fabric.
- Config schema for BYOK providers and local models.
- Telemetry hooks for latency, error rate, and spend estimates.

## Technical Design

### Core Types

- `ProviderConfig`: provider, base_url, auth_ref, model_ids.
- `ModelRoute`: worker_id, task_type, preferred_model.
- `ModelRequest`: prompt, tools, safety, trace_id.
- `ModelResponse`: text, tokens, usage, citations.

### Execution Flow

1. Load provider configs from local store.
2. Resolve route for task or worker.
3. Dispatch request via Rust HTTP client.
4. Emit telemetry and persist usage summary.

### Rust-First Boundary

- Rust owns provider configs, routing, and HTTP execution.
- TypeScript specifies policy and displays model settings.

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AS.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Reuse `CompletionRequest` and `CompletionResponse` from `packages/ai-core/src/providers/types.ts`.

New model fabric types (Rust + TS, mirrored shapes):

- `ProviderConfigRecord { provider_id, kind, auth_ref, base_url?, timeout_ms?, max_retries?, organization_id?, model_ids[], default_model_id? }`
- `RouteRule { rule_id, priority, worker_id?, task_type?, model_id, fallback_model_ids? }`
- `ModelUsageEvent { event_id, provider_id, model_id, input_tokens, output_tokens, total_tokens, latency_ms, cost_usd?, created_at }`
- `ModelFabricSnapshot { providers[], routes[], usage_cursor }`

Enum values:
- `ProviderKind`: openai | anthropic | gemini | local

### 2) Provider Configuration

- `auth_ref` points to a secret in Track AU; Rust resolves the plaintext API key at call time.
- Provider configs are validated on load (required fields present, model list non-empty).
- Provider ordering is deterministic by `provider_id` asc.

### 3) Routing Policy

- Routes are evaluated by `priority` desc, then `rule_id` asc.
- A route matches if all provided filters (`worker_id`, `task_type`) match the request context.
- If no route matches, use provider default model if configured; otherwise return error.

### 4) Execution and Telemetry

- Map `CompletionRequest` to provider-specific HTTP requests.
- Collect `CompletionResponse`, latency, token usage, and errors.
- Emit `ModelUsageEvent` per request and persist via Track AU.
- Never log plaintext API keys or prompts in telemetry.

### 5) FFI Boundary (Rust <-> Node)

Expose N-API class `ModelFabric`:

- `loadProviders(records[])`
- `loadRoutes(routes[])`
- `complete(request, context?) -> CompletionResponse`
- `stream(request, context?) -> streamHandle`
- `getSnapshot() -> ModelFabricSnapshot`
- `drainUsageEvents(after?, limit?) -> ModelUsageEvent[]`
- `reset()`

Node loader:
- `@ku0/model-fabric-rs/node` uses `@ku0/native-bindings`.
- Env overrides: `KU0_MODEL_FABRIC_NATIVE_PATH` and `KU0_MODEL_FABRIC_DISABLE_NATIVE=1`.
- Required export: `ModelFabric`.

### 6) TypeScript Integration

- `packages/ai-core` routes requests to the native fabric when enabled.
- `packages/agent-runtime-control` manages provider config CRUD.

### 7) Tests (Required)

Rust unit tests:
- Route selection honors priority and filters.
- Provider config validation rejects missing models.
- Usage events include latency and token counts.

TypeScript validation:
- `packages/ai-core` build passes with native fabric types.

### 8) Validation Commands

- `cargo test` (in `packages/model-fabric-rs`)
- `pnpm -C packages/ai-core build`
- `pnpm biome check --write`

### 9) Definition of Done

- Providers load and route deterministically.
- Requests execute via Rust HTTP pipeline.
- Usage telemetry is persisted and redacted.
- Native binding is callable from `ai-core`.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Provider registry | config storage, validation, default routing |
| 2 | Execution and telemetry | HTTP pipeline, usage metrics, error mapping |

## Affected Code

- `packages/ai-core/`
- `packages/agent-runtime-control/`
- `packages/model-fabric-rs/` (new)

## Acceptance Criteria

- Support at least OpenAI, Anthropic, and Gemini BYOK configs.
- Support local OpenAI-compatible endpoints.
- Route model requests by worker and task type.
- Capture usage metrics without logging plaintext keys.

## Risks

- Provider API drift and compatibility variance.
- Rate limiting and retry policies across providers.

## References

- `.tmp/analysis/eigent/docs/core/models/byok.md`
- `.tmp/analysis/eigent/docs/core/models/local-model.md`
