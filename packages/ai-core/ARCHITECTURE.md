# AI Core Architecture

> **Golden Rule**: Use Vercel AI SDK for LLM interactions. Use Zod schemas for structured outputs.

## Core Integrations

| Capability | Standard Library | Status |
|------------|------------------|--------|
| **LLM Providers** | Vercel AI SDK (`ai`, `@ai-sdk/*`) | ✅ Mandatory |
| **Structured Output** | Zod schemas (v4.x) + `generateObject` | ✅ Mandatory |
| **Token Counting** | `js-tiktoken` | ✅ Standard |
| **Resilience** | `cockatiel` | ✅ Standard |
| **Observability** | `langfuse` | ✅ Standard |

---

## 1. LLM Providers

**Standard**: Use `VercelAIAdapter` from `providers/vercelAdapter.ts`.

```typescript
// ✅ CORRECT
import { createOpenAIAdapter } from "@ku0/ai-core";
const llm = createOpenAIAdapter({ apiKey: "..." });
await llm.complete({ model: "gpt-4o", messages });

// ❌ DEPRECATED
import { OpenAIProvider } from "@ku0/ai-core";
```

## 2. Structured Output

**Standard**: Use Zod schemas with `generateObject`.

```typescript
// ✅ CORRECT
import { generateObject } from "ai";
import { DigestMapOutputSchema, buildDigestMapUserPrompt } from "@ku0/ai-core";

const result = await generateObject({
  model: openai("gpt-4o"),
  schema: DigestMapOutputSchema,
  prompt: buildDigestMapUserPrompt(input),
});

// ❌ DEPRECATED
import { buildDigestMapPrompt } from "@ku0/ai-core";
const prompt = buildDigestMapPrompt(input); // Contains manual JSON schema
```

## 3. Available Schemas

| Schema | Purpose |
|--------|---------|
| `DigestMapOutputSchema` | Summarize source text |
| `DigestReduceOutputSchema` | Synthesize multiple summaries |
| `VerifierOutputSchema` | Verify claims against sources |
