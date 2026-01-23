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

## Scope

- Provider registry and credential storage.
- Local model endpoint configuration (OpenAI-compatible servers).
- Routing policy for model selection per task or worker.
- Usage metering and cost tracking per provider.

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
