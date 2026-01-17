/**
 * Digest Module
 *
 * AI-powered daily digest generation with citation enforcement.
 * Part of Track 2: Intelligence & Logic (AI)
 */

export type {
  ContentStore,
  DigestServiceConfig,
  DigestStore,
} from "./digestService";

// Services
export { DigestService } from "./digestService";
export type { LLMSynthesizerConfig } from "./llmSynthesizer";

// LLM Synthesizer
export { createLLMSynthesizer, LLMSynthesizer } from "./llmSynthesizer";
export type { DigestDbDriver } from "./storageAdapters";
// Storage Adapters
export { ContentStoreAdapter, DigestStoreAdapter } from "./storageAdapters";
// Types
export * from "./types";
export type { VerificationAgentConfig } from "./verificationAgent";
// Agents
export { VerificationAgent } from "./verificationAgent";
