# Track 7: Provider Agnostic Architecture (Multi-Model Support)

## Mission
Enable Cowork to support multiple AI model providers (OpenAI, Anthropic, Google, Ollama, etc.)
with seamless switching, eliminating vendor lock-in and maximizing user flexibility.

## Primary Goal
Deliver a model-agnostic architecture that allows users to bring their own API keys,
switch providers mid-session, and maintain consistent experience across all supported models.

## Background
Analysis of OpenCode's rapid adoption (2025-2026) reveals that **provider agnosticism**
is a critical differentiator. OpenCode supports 75+ models via a unified interface,
while Claude Code's Anthropic lock-in has caused user friction during policy changes.

## Scope
- Provider abstraction layer in agent-runtime and cowork-server.
- Model registry with capabilities, pricing metadata, and context limits.
- User-provided API key management (encrypted storage).
- Model selector UI with capability indicators.
- Graceful fallback when primary provider fails.
- Token/cost transparency per provider.

## Contracts and Data Flow
- Message schema must carry `providerId` + `modelId` for storage and SSE playback.
- SSE payloads should include provider/model identifiers and fallback notice when used.
- Settings schema should migrate from `openAiKey`/`anthropicKey`/`geminiKey` to
  a provider-key map while keeping backward compatibility for older settings.

## Storage and Security
- Store provider keys encrypted at rest (server-side) and never log raw keys.
- Reuse `packages/shell/src/lib/crypto/keyEncryption.ts` for client-side encryption when
  storing keys in browser storage (Cowork UI).
- Add a lightweight migration step to move legacy keys into the new storage structure.

## API Surface (Server)
- `GET /api/providers` -> registry metadata + capabilities.
- `GET /api/settings/providers/:providerId/key` -> `{ ok, hasKey, lastValidatedAt }`
- `POST /api/settings/providers/:providerId/key` -> store encrypted key + validate.
- `DELETE /api/settings/providers/:providerId/key` -> revoke key.

## Fallback Policy
- Allow a configured fallback chain per session (primary -> secondary -> tertiary).
- Emit a `fallbackNotice` in message metadata when fallback occurs.

## Non-Goals
- Hosting or proxying API calls (users pay directly).
- Fine-tuning or custom model training.
- Provider-specific advanced features (first-class parity only).

## Inputs and References
- OpenCode: `github.com/sst/opencode` (provider abstraction patterns)
- `packages/agent-runtime/src/core/orchestrator.ts`
- `apps/cowork/server/routes/chat.ts`
- `packages/llm-api/` (if exists, or create new)

## Execution Steps (Do This First)
1. **Research**: Review OpenCode's provider abstraction in Go; adapt patterns for TypeScript.
2. **Define Model Registry Schema**:
   ```typescript
   interface ModelProvider {
     id: string; // e.g., 'openai', 'anthropic', 'google', 'ollama'
     name: string;
     models: ModelDefinition[];
     authType: 'api_key' | 'oauth' | 'local';
     baseUrl?: string;
   }

   interface ModelDefinition {
     id: string; // e.g., 'gpt-4o', 'claude-opus-4'
     displayName: string;
     contextWindow: number;
     maxOutputTokens: number;
     supportsStreaming: boolean;
     supportsTools: boolean;
     supportsVision: boolean;
     pricingPer1kInput?: number;
     pricingPer1kOutput?: number;
   }
   ```
3. **Create Provider Adapter Interface**:
   ```typescript
   interface LLMProviderAdapter {
     readonly providerId: string;
     chat(request: ChatRequest): AsyncIterable<ChatChunk>;
     validateApiKey(key: string): Promise<boolean>;
     getAvailableModels(): Promise<ModelDefinition[]>;
   }
   ```
4. **Implement Adapters**: Start with OpenAI, Anthropic, Google Gemini, Ollama.
5. **API Key Management**: Encrypted storage in user settings, never logged.
6. **Model Selector UI**: Dropdown with provider grouping, capability badges.
7. **Fallback Logic**: Auto-switch to backup provider on failure (configurable).
8. **Cost Tracking**: Accumulate token usage per session, display in UI.

## Required Behavior
- Users can select from all configured providers and models.
- Model switch mid-conversation preserves context (within limits).
- API keys are stored securely, never transmitted except to provider.
- Fallback is transparent with user notification.
- Token costs are visible in real-time.

## Implementation Outline
1. Create `packages/llm-providers/` with adapter pattern.
2. Implement `OpenAIAdapter`, `AnthropicAdapter`, `GoogleAdapter`, `OllamaAdapter`.
3. Add model registry JSON/YAML (or fetch from `models.dev` API).
4. Update `apps/cowork/server/routes/chat.ts` to use adapter interface.
5. Add API key CRUD endpoints: `POST/GET/DELETE /api/settings/providers/{id}/key`.
6. Build model selector component with provider grouping and capability badges.
7. Add fallback logic and telemetry tags.
8. Add cost tracking middleware; expose via SSE events.

## Deliverables
- `@ku0/llm-providers` package with adapter implementations.
- Model registry with 10+ models across 4+ providers.
- API key management API and UI.
- Model selector with capability badges.
- Cost transparency widget.

## Acceptance Criteria
- [ ] Can complete identical task using OpenAI, Anthropic, and Ollama.
- [ ] Model switch mid-session works without data loss.
- [ ] API keys are encrypted at rest.
- [ ] Token usage and cost displayed per message.
- [ ] Fallback triggers and notifies user on provider failure.

## Testing
- Unit tests per adapter with mocked responses.
- Integration test: round-trip with real providers (CI secrets).
- `pnpm vitest run --project llm-providers`

## Dependencies
- Track 1: Message schema must include `modelId` and `providerId` fields.
- Track 5: Telemetry should emit provider-specific metrics.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
